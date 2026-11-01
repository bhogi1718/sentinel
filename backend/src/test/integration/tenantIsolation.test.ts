import type { Application } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Tenant isolation through the real HTTP stack and a real Postgres: the
// actual routes, middleware, services, repositories, Prisma client and
// migrated schema. Nothing is mocked, so a query that forgets to filter by
// organization fails here even if every unit test passes.
//
// Two organizations, A and B, each with an owner and a device that has
// events, commands and Telegram settings. Organization A also has a viewer.

let database: TestDatabase;
let prisma: PrismaClient;
let app: Application;
let deviceService: typeof import("../../modules/device/device.service").deviceService;

beforeAll(async () => {
  database = await startTestDatabase();
  // Prisma reads DATABASE_URL when the client is constructed, so the app is
  // imported only after it points at the test database.
  process.env.DATABASE_URL = database.url;
  ({ prisma } = await import("../../prisma/client"));
  ({ deviceService } = await import("../../modules/device/device.service"));
  app = (await import("../../app")).createApp();
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  await database.stop();
});

interface World {
  orgA: string;
  orgB: string;
  aliceOwnerA: { id: string; email: string };
  bobOwnerB: { id: string; email: string };
  victorViewerA: { id: string; email: string };
  deviceA: string;
  deviceB: string;
}

let world: World;

async function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "not-used" }, select: { id: true, email: true } });
}

async function createOrgWithDevice(name: string, owner: { id: string }) {
  const org = await prisma.organization.create({ data: { name, slug: name.toLowerCase() } });
  await prisma.membership.create({ data: { userId: owner.id, orgId: org.id, role: "OWNER" } });
  const device = await prisma.device.create({
    data: { orgId: org.id, name: `${name} laptop`, tokenHash: deviceService.hashToken(`token-${name}`) },
  });
  await prisma.event.createMany({
    data: [
      { orgId: org.id, deviceId: device.id, type: "BOOT", metadata: { org: name } },
      { orgId: org.id, deviceId: device.id, type: "LOCK", metadata: { org: name } },
    ],
  });
  await prisma.command.create({
    data: { orgId: org.id, deviceId: device.id, requestedById: owner.id, type: "LOCK", status: "ACKNOWLEDGED" },
  });
  await prisma.organizationSettings.create({
    data: { orgId: org.id, telegramBotToken: `bot-${name}`, telegramChatId: `chat-${name}` },
  });
  return { orgId: org.id, deviceId: device.id };
}

beforeEach(async () => {
  await database.reset();

  const aliceOwnerA = await createUser("alice@a.example");
  const bobOwnerB = await createUser("bob@b.example");
  const victorViewerA = await createUser("victor@a.example");

  const a = await createOrgWithDevice("Acme", aliceOwnerA);
  const b = await createOrgWithDevice("Bravo", bobOwnerB);
  await prisma.membership.create({ data: { userId: victorViewerA.id, orgId: a.orgId, role: "VIEWER" } });

  world = {
    orgA: a.orgId,
    orgB: b.orgId,
    aliceOwnerA,
    bobOwnerB,
    victorViewerA,
    deviceA: a.deviceId,
    deviceB: b.deviceId,
  };
});

function as(user: { id: string; email: string }) {
  const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
    token: accessTokenFor(user),
  };
}

function dataOf<T>(res: request.Response): T {
  return (res.body as { data: T }).data;
}

describe("organizations", () => {
  it("lists only the organizations the caller belongs to", async () => {
    const res = await as(world.aliceOwnerA).get("/api/orgs");

    expect(res.status).toBe(200);
    expect(dataOf<{ id: string }[]>(res).map((org) => org.id)).toEqual([world.orgA]);
  });

  it("hides another organization and its members", async () => {
    const alice = as(world.aliceOwnerA);

    expect((await alice.get(`/api/orgs/${world.orgB}`)).status).toBe(404);
    expect((await alice.get(`/api/orgs/${world.orgB}/members`)).status).toBe(404);
  });

  it("answers a real-but-foreign organization exactly like a nonexistent one", async () => {
    const alice = as(world.aliceOwnerA);

    const foreign = await alice.get(`/api/orgs/${world.orgB}`);
    const missing = await alice.get("/api/orgs/00000000-0000-0000-0000-000000000000");

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it("applies a removed membership on the very next request", async () => {
    const victor = as(world.victorViewerA);
    expect((await victor.get(`/api/orgs/${world.orgA}/devices`)).status).toBe(200);

    await prisma.membership.delete({ where: { userId_orgId: { userId: world.victorViewerA.id, orgId: world.orgA } } });

    expect((await victor.get(`/api/orgs/${world.orgA}/devices`)).status).toBe(404);
  });
});

describe("devices", () => {
  it("lists only the organization's own devices, without token hashes", async () => {
    const res = await as(world.aliceOwnerA).get(`/api/orgs/${world.orgA}/devices`);

    const devices = dataOf<Record<string, unknown>[]>(res);
    expect(devices.map((device) => device.id)).toEqual([world.deviceA]);
    expect(devices[0]).not.toHaveProperty("tokenHash");
  });

  it("refuses every device route for another organization's device, reached through the caller's own organization", async () => {
    const alice = as(world.aliceOwnerA);
    const base = `/api/orgs/${world.orgA}/devices/${world.deviceB}`;

    const responses = await Promise.all([
      alice.get(base),
      alice.get(`${base}/commands`),
      alice.post(`${base}/commands`, { type: "SHUTDOWN" }),
      alice.get(`${base}/processes`),
      alice.get(`${base}/metrics`),
      alice.get(`${base}/files`),
      alice.post(`${base}/screenshot`),
      request(app).get(`${base}/files/download`).query({ path: "secret.txt", token: alice.token }),
    ]);

    expect(responses.map((res) => res.status)).toEqual(Array(responses.length).fill(404));
    // And nothing was recorded against device B.
    expect(await prisma.command.count({ where: { deviceId: world.deviceB } })).toBe(1);
  });

  it("refuses another organization's device through that organization's own path", async () => {
    const res = await as(world.aliceOwnerA).get(`/api/orgs/${world.orgB}/devices/${world.deviceB}`);
    expect(res.status).toBe(404);
  });

  it("pairs a device into the caller's organization whose token authenticates into that organization", async () => {
    const created = await as(world.aliceOwnerA).post(`/api/orgs/${world.orgA}/devices/pairing-codes`, { name: "Second laptop" });
    expect(created.status).toBe(201);
    const { code } = dataOf<{ code: string }>(created);

    const paired = await request(app).post("/api/agent/pair").send({ code });
    expect(paired.status).toBe(201);
    const { deviceId, token } = dataOf<{ deviceId: string; token: string }>(paired);
    await expect(deviceService.authenticate(token)).resolves.toEqual({
      id: deviceId,
      orgId: world.orgA,
      name: "Second laptop",
    });
  });
});

describe("events and command history", () => {
  it("lists only the organization's events", async () => {
    const res = await as(world.aliceOwnerA).get(`/api/orgs/${world.orgA}/events`);

    const events = dataOf<{ items: { orgId: string; metadata: { org: string } }[] }>(res).items;
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.orgId === world.orgA && event.metadata.org === "Acme")).toBe(true);
  });

  it("returns nothing when filtering by another organization's device", async () => {
    const res = await as(world.aliceOwnerA)
      .get(`/api/orgs/${world.orgA}/events`)
      .query({ deviceId: world.deviceB });

    expect(dataOf<{ items: unknown[]; pagination: { total: number } }>(res)).toMatchObject({
      items: [],
      pagination: { total: 0 },
    });
  });

  it("lists only the device's own commands, with who sent them", async () => {
    const res = await as(world.aliceOwnerA).get(`/api/orgs/${world.orgA}/devices/${world.deviceA}/commands`);

    const commands = dataOf<{ items: { deviceId: string; requestedBy: { email: string } }[] }>(res).items;
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ deviceId: world.deviceA, requestedBy: { email: "alice@a.example" } });
  });
});

describe("settings", () => {
  it("disconnecting one organization's Telegram leaves the other's untouched", async () => {
    const res = await as(world.aliceOwnerA).delete(`/api/orgs/${world.orgA}/settings/integrations/telegram`);

    expect(res.status).toBe(200);
    const [a, b] = await Promise.all([
      prisma.organizationSettings.findUnique({ where: { orgId: world.orgA } }),
      prisma.organizationSettings.findUnique({ where: { orgId: world.orgB } }),
    ]);
    expect(a).toMatchObject({ telegramBotToken: null, telegramChatId: null });
    expect(b).toMatchObject({ telegramBotToken: "bot-Bravo", telegramChatId: "chat-Bravo" });
  });

  it("refuses to touch another organization's settings", async () => {
    const res = await as(world.aliceOwnerA).delete(`/api/orgs/${world.orgB}/settings/integrations/telegram`);

    expect(res.status).toBe(404);
    expect(await prisma.organizationSettings.findUnique({ where: { orgId: world.orgB } })).toMatchObject({
      telegramBotToken: "bot-Bravo",
    });
  });
});

describe("roles", () => {
  it("lets a viewer read but not act", async () => {
    const victor = as(world.victorViewerA);
    const base = `/api/orgs/${world.orgA}/devices/${world.deviceA}`;

    expect((await victor.get(`/api/orgs/${world.orgA}/events`)).status).toBe(200);
    expect((await victor.get(base)).status).toBe(200);
    expect((await victor.post(`${base}/commands`, { type: "LOCK" })).status).toBe(403);
    expect((await victor.get(`${base}/files`)).status).toBe(403);
    expect((await victor.post(`${base}/screenshot`)).status).toBe(403);
    expect((await victor.post(`/api/orgs/${world.orgA}/devices/pairing-codes`, { name: "Sneaky" })).status).toBe(403);
    expect((await victor.delete(`/api/orgs/${world.orgA}/settings/integrations/telegram`)).status).toBe(403);
    expect(await prisma.device.count({ where: { orgId: world.orgA } })).toBe(1);
  });
});
