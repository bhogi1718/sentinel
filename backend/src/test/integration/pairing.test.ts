import type { PrismaClient } from "@prisma/client";
import type { Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Pairing end to end on a real database and a listening server: an admin
// creates a code, an agent exchanges it for a device and a token, and that
// token passes the agent handshake. Codes work once, expire, can be
// cancelled, and are confined to their organization. Acme has an owner and
// an admin; Bravo is a second organization.

let database: TestDatabase;
let prisma: PrismaClient;
let server: HttpServer;
let baseUrl: string;
let hashToken: (token: string) => string;

type Person = { id: string; email: string };
let owner: Person;
let admin: Person;
let bravoOwner: Person;
let acme: string;
let bravo: string;

const sockets: ClientSocket[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  process.env.DATABASE_URL = database.url;

  ({ prisma } = await import("../../prisma/client"));
  ({ hashToken } = await import("../../common/hashToken"));
  const { createApp } = await import("../../app");
  const { initSocketServer } = await import("../../realtime/socket");
  const { createServer } = await import("http");

  server = createServer(createApp());
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  await database.stop();
});

beforeEach(async () => {
  await database.reset();
  const person = (email: string) =>
    prisma.user.create({ data: { email, name: email.split("@")[0], passwordHash: "not-used" }, select: { id: true, email: true } });
  owner = await person("olivia@acme.example");
  admin = await person("adam@acme.example");
  bravoOwner = await person("bob@bravo.example");

  acme = (await prisma.organization.create({ data: { name: "Acme", slug: "acme" } })).id;
  bravo = (await prisma.organization.create({ data: { name: "Bravo", slug: "bravo" } })).id;
  await prisma.membership.createMany({
    data: [
      { userId: owner.id, orgId: acme, role: "OWNER" },
      { userId: admin.id, orgId: acme, role: "ADMIN" },
      { userId: bravoOwner.id, orgId: bravo, role: "OWNER" },
    ],
  });
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

function as(user: Person) {
  const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
  return {
    post: (url: string, body?: object) => request(server).post(url).set(auth).send(body),
    delete: (url: string) => request(server).delete(url).set(auth),
  };
}

interface CreatedCode {
  id: string;
  code: string;
  deviceName: string;
  expiresAt: string;
}

interface Paired {
  deviceId: string;
  deviceName: string;
  token: string;
}

async function createCode(user = admin, orgId = acme, name = "Design laptop"): Promise<CreatedCode> {
  const res = await as(user).post(`/api/orgs/${orgId}/devices/pairing-codes`, { name });
  expect(res.status).toBe(201);
  return (res.body as { data: CreatedCode }).data;
}

function pair(code: string) {
  return request(server).post("/api/agent/pair").send({ code });
}

function pairedFrom(res: request.Response): Paired {
  return (res.body as { data: Paired }).data;
}

function open(namespace: "/agent" | "/dashboard", token: string): ClientSocket {
  const socket = connect(`${baseUrl}${namespace}`, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false });
  sockets.push(socket);
  return socket;
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

describe("creating a code", () => {
  it("returns a short code once, expiring in 15 minutes, and stores only its hash", async () => {
    const created = await createCode();

    expect(created.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(created.deviceName).toBe("Design laptop");
    const minutesLeft = (new Date(created.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(14);
    expect(minutesLeft).toBeLessThanOrEqual(15);

    const row = await prisma.pairingCode.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.codeHash).toBe(hashToken(created.code.replace("-", "")));
    expect(JSON.stringify(row)).not.toContain(created.code.replace("-", ""));
  });
});

describe("pairing an agent", () => {
  it("creates the device in the code's organization, with a token that passes the agent handshake", async () => {
    const created = await createCode();

    const res = await pair(created.code);

    expect(res.status).toBe(201);
    const { deviceId, deviceName, token } = pairedFrom(res);
    expect(deviceName).toBe("Design laptop");
    expect(token).toMatch(/^[0-9a-f]{96}$/);
    expect(await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })).toMatchObject({ orgId: acme, name: "Design laptop" });
    await connected(open("/agent", token));
  });

  it("records who created the code as having added the device", async () => {
    const created = await createCode(admin);
    const { deviceId } = pairedFrom(await pair(created.code));

    const entries = await prisma.auditEvent.findMany();
    expect(entries).toEqual([
      expect.objectContaining({
        action: "DEVICE_ADDED",
        outcome: "SUCCESS",
        actorEmail: admin.email,
        deviceId,
        deviceName: "Design laptop",
        orgId: acme,
      }),
    ]);
  });

  it("tells the organization's open consoles which code was used, and no one else's", async () => {
    const acmeConsole = open("/dashboard", accessTokenFor(owner));
    const bravoConsole = open("/dashboard", accessTokenFor(bravoOwner));
    await Promise.all([connected(acmeConsole), connected(bravoConsole)]);
    const told = new Promise((resolve) => acmeConsole.once("device:added", resolve));
    const bravoHeard = vi.fn();
    bravoConsole.on("device:added", bravoHeard);
    const created = await createCode();

    const { deviceId } = pairedFrom(await pair(created.code));

    expect(await told).toEqual({ deviceId, pairingCodeId: created.id });
    expect(bravoHeard).not.toHaveBeenCalled();
  });

  it("accepts the code typed in lowercase, without the dash, with spaces", async () => {
    const created = await createCode();
    const typed = ` ${created.code.replace("-", " ").toLowerCase()} `;

    expect((await pair(typed)).status).toBe(201);
  });

  it("works only once, even when two agents present it at the same moment", async () => {
    const created = await createCode();

    const results = await Promise.all([pair(created.code), pair(created.code)]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 404]);
    expect(await prisma.device.count()).toBe(1);
    expect((await pair(created.code)).status).toBe(404);
  });

  it("refuses an expired code", async () => {
    const created = await createCode();
    await prisma.pairingCode.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await pair(created.code)).status).toBe(404);
    expect(await prisma.device.count()).toBe(0);
  });

  it("refuses a code whose creator's account no longer exists", async () => {
    const created = await createCode(admin);
    await prisma.user.delete({ where: { id: admin.id } });

    expect((await pair(created.code)).status).toBe(404);
    expect(await prisma.device.count()).toBe(0);
  });

  it("refuses unknown and malformed codes", async () => {
    expect((await pair("AAAA-AAAA")).status).toBe(404);
    expect((await pair("not a code")).status).toBe(400);
    expect((await pair("OOOO-1111")).status).toBe(400);
  });
});

describe("cancelling a code", () => {
  it("makes the code unusable", async () => {
    const created = await createCode();

    expect((await as(owner).delete(`/api/orgs/${acme}/devices/pairing-codes/${created.id}`)).status).toBe(200);

    expect((await pair(created.code)).status).toBe(404);
  });

  it("can't reach another organization's codes", async () => {
    const created = await createCode();

    expect((await as(bravoOwner).delete(`/api/orgs/${bravo}/devices/pairing-codes/${created.id}`)).status).toBe(404);
    expect((await as(bravoOwner).delete(`/api/orgs/${acme}/devices/pairing-codes/${created.id}`)).status).toBe(404);
    expect((await pair(created.code)).status).toBe(201);
  });
});
