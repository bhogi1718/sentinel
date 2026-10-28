import type { PrismaClient } from "@prisma/client";
import type { Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Removing a device end to end: a real database, a real listening server and
// an agent connected to it with the device's token. Removal must delete the
// device and its history, cut the agent off and refuse its token from then
// on, tell open consoles, end any live view, and leave an audit entry. Acme
// has an owner, an admin and a viewer; Bravo is a second organization.

let database: TestDatabase;
let prisma: PrismaClient;
let server: HttpServer;
let baseUrl: string;
let hashToken: (token: string) => string;

type Person = { id: string; email: string };
let owner: Person;
let admin: Person;
let viewer: Person;
let bravoOwner: Person;
let acme: string;
let bravo: string;
let laptop: string;

const LAPTOP_TOKEN = "acme-laptop-token";
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
  viewer = await person("vera@acme.example");
  bravoOwner = await person("bob@bravo.example");

  acme = (await prisma.organization.create({ data: { name: "Acme", slug: "acme" } })).id;
  bravo = (await prisma.organization.create({ data: { name: "Bravo", slug: "bravo" } })).id;
  await prisma.membership.createMany({
    data: [
      { userId: owner.id, orgId: acme, role: "OWNER" },
      { userId: admin.id, orgId: acme, role: "ADMIN" },
      { userId: viewer.id, orgId: acme, role: "VIEWER" },
      { userId: bravoOwner.id, orgId: bravo, role: "OWNER" },
    ],
  });
  laptop = (await prisma.device.create({ data: { orgId: acme, name: "Acme laptop", tokenHash: hashToken(LAPTOP_TOKEN) } })).id;
  await prisma.event.create({ data: { orgId: acme, deviceId: laptop, type: "BOOT" } });
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

function as(user: Person) {
  const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
  return {
    get: (url: string) => request(server).get(url).set(auth),
    delete: (url: string) => request(server).delete(url).set(auth),
  };
}

const device = (orgId = acme) => `/api/orgs/${orgId}/devices/${laptop}`;

function open(namespace: "/agent" | "/dashboard", token: string): ClientSocket {
  const socket = connect(`${baseUrl}${namespace}`, {
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

/// An agent connected as the laptop, once the server counts it as online.
async function connectAgent(): Promise<ClientSocket> {
  const agent = open("/agent", LAPTOP_TOKEN);
  await connected(agent);
  await vi.waitFor(
    async () => expect(((await as(owner).get(device())).body as { data: { isOnline: boolean } }).data.isOnline).toBe(true),
    { timeout: 5_000, interval: 50 },
  );
  return agent;
}

async function trail() {
  const rows = await prisma.auditEvent.findMany({ orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  return rows.map((row) => ({
    action: row.action,
    outcome: row.outcome,
    actor: row.actorEmail,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    detail: row.detail,
  }));
}

describe("removing a device", () => {
  it("deletes the device and its history, and records who removed it", async () => {
    const res = await as(admin).delete(device());

    expect(res.status).toBe(200);
    expect(await prisma.device.count()).toBe(0);
    expect(await prisma.event.count()).toBe(0);
    expect((await as(owner).get(device())).status).toBe(404);
    expect(await trail()).toEqual([
      { action: "DEVICE_REMOVED", outcome: "SUCCESS", actor: admin.email, deviceId: laptop, deviceName: "Acme laptop", detail: null },
    ]);
  });

  it("cuts off the connected agent and refuses its token from then on", async () => {
    const agent = await connectAgent();
    const cutOff = new Promise<string>((resolve) => agent.once("disconnect", resolve));

    expect((await as(owner).delete(device())).status).toBe(200);

    expect(await cutOff).toBe("io server disconnect");
    await expect(connected(open("/agent", LAPTOP_TOKEN))).rejects.toThrow("Invalid device token");
  });

  it("tells the organization's open consoles, and no one else's", async () => {
    const acmeConsole = open("/dashboard", accessTokenFor(viewer));
    const bravoConsole = open("/dashboard", accessTokenFor(bravoOwner));
    await Promise.all([connected(acmeConsole), connected(bravoConsole)]);
    const told = new Promise((resolve) => acmeConsole.once("device:removed", resolve));
    const bravoHeard = vi.fn();
    bravoConsole.on("device:removed", bravoHeard);

    await as(admin).delete(device());

    expect(await told).toEqual({ deviceId: laptop });
    expect(bravoHeard).not.toHaveBeenCalled();
  });

  it("ends a live view in progress", async () => {
    await connectAgent();
    const watcher = open("/dashboard", accessTokenFor(owner));
    await connected(watcher);
    const started = await new Promise((resolve) => watcher.emit("stream:start", { orgId: acme, deviceId: laptop }, resolve));
    expect(started).toEqual({ success: true });
    const stopped = new Promise((resolve) => watcher.on("stream:state", (state: { active: boolean }) => !state.active && resolve(state)));

    await as(owner).delete(device());

    expect(await stopped).toMatchObject({ deviceId: laptop, active: false });
    await vi.waitFor(
      async () =>
        expect(await trail()).toMatchObject([
          { action: "LIVE_VIEW_STARTED" },
          { action: "DEVICE_REMOVED" },
          { action: "LIVE_VIEW_ENDED", detail: { reason: "DEVICE_REMOVED" } },
        ]),
      { timeout: 5_000, interval: 50 },
    );
  });
});

describe("who can remove a device", () => {
  it("refuses viewers", async () => {
    expect((await as(viewer).delete(device())).status).toBe(403);
    expect(await prisma.device.count()).toBe(1);
    expect(await trail()).toEqual([]);
  });

  it("hides the device from other organizations", async () => {
    expect((await as(bravoOwner).delete(device())).status).toBe(404);
    expect((await as(bravoOwner).delete(device(bravo))).status).toBe(404);
    expect(await prisma.device.count()).toBe(1);
  });

  it("doesn't let anyone remove the shared demo's devices", async () => {
    await prisma.organization.update({ where: { id: acme }, data: { isDemo: true } });

    expect((await as(owner).delete(device())).status).toBe(403);
    expect(await prisma.device.count()).toBe(1);
  });
});
