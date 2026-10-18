import type { PrismaClient } from "@prisma/client";
import type { Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fileContents } from "../../demo/simulatedData";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// The audit log end to end: a real database, a real listening server, and a
// simulated device connected to it exactly like a real agent - so every
// sensitive action runs for real, and the test checks what it left in the
// log. Organization Acme has an owner, an admin, a viewer and the connected
// laptop; Bravo is a second organization whose owner must see none of it.

let database: TestDatabase;
let prisma: PrismaClient;
let server: HttpServer;
let baseUrl: string;
let stopSimulator: () => void;
let pruneAuditLog: typeof import("../../modules/audit/auditRetention").pruneAuditLog;

type Person = { id: string; email: string };
let owner: Person;
let admin: Person;
let viewer: Person;
let bravoOwner: Person;
let acme: string;
let bravo: string;
let laptop: string;

const sockets: ClientSocket[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  process.env.DATABASE_URL = database.url;

  ({ prisma } = await import("../../prisma/client"));
  ({ pruneAuditLog } = await import("../../modules/audit/auditRetention"));
  const { deviceService } = await import("../../modules/device/device.service");
  const { createApp } = await import("../../app");
  const { initSocketServer } = await import("../../realtime/socket");
  const { startDemoSimulator } = await import("../../demo/simulator");
  const { createServer } = await import("http");

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
  laptop = (
    await prisma.device.create({
      data: { orgId: acme, name: "Acme laptop", tokenHash: deviceService.hashToken("acme-laptop-token") },
    })
  ).id;

  server = createServer(createApp());
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const simulator = startDemoSimulator({ serverUrl: baseUrl, deviceToken: "acme-laptop-token", commandDelayMs: 20 });
  stopSimulator = () => simulator.stop();

  await vi.waitFor(
    async () => {
      const res = await as(owner).get(`/api/orgs/${acme}/devices/${laptop}`);
      expect((res.body as { data: { isOnline: boolean } }).data.isOnline).toBe(true);
    },
    { timeout: 10_000, interval: 100 },
  );
}, 60_000);

afterAll(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  stopSimulator?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  await database.stop();
});

beforeEach(async () => {
  await prisma.auditEvent.deleteMany();
});

function as(user: Person) {
  const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
  return {
    get: (url: string) => request(server).get(url).set(auth),
    post: (url: string, body?: object) => request(server).post(url).set(auth).send(body),
  };
}

interface AuditItem {
  action: string;
  outcome: string;
  actorEmail: string;
  actor: { id: string; name: string | null; email: string } | null;
  deviceId: string | null;
  deviceName: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: string;
}

async function auditLog(user: Person, query = "") {
  const res = await as(user).get(`/api/orgs/${acme}/audit${query}`);
  expect(res.status).toBe(200);
  return (res.body as { data: { items: AuditItem[]; pagination: { total: number } } }).data;
}

/// What the log holds now, oldest first, as [action, outcome, actor email].
async function trail(): Promise<[string, string, string][]> {
  const rows = await prisma.auditEvent.findMany({ orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  return rows.map((row) => [row.action, row.outcome, row.actorEmail]);
}

const device = () => `/api/orgs/${acme}/devices/${laptop}`;

async function dashboard(user: Person): Promise<ClientSocket> {
  const socket = connect(`${baseUrl}/dashboard`, { auth: { token: accessTokenFor(user) }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

function startLiveView(socket: ClientSocket, orgId = acme): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit("stream:start", { orgId, deviceId: laptop }, resolve));
}

describe("each sensitive action writes exactly one entry", () => {
  it("records a screenshot", async () => {
    const res = await as(admin).post(`${device()}/screenshot`);
    expect(res.status).toBe(200);

    expect(await trail()).toEqual([["SCREENSHOT_CAPTURED", "SUCCESS", admin.email]]);
  });

  it("records a folder listing with its path", async () => {
    expect((await as(owner).get(`${device()}/files?path=Documents`)).status).toBe(200);

    const [entry] = (await auditLog(owner)).items;
    expect(await trail()).toEqual([["FILES_LISTED", "SUCCESS", owner.email]]);
    expect(entry.detail).toEqual({ path: "Documents" });
  });

  it("records a download with its path and size", async () => {
    const token = accessTokenFor(admin);
    const res = await request(server).get(`${device()}/files/download?path=notes.txt&token=${token}`);
    expect(res.status).toBe(200);

    const [entry] = (await auditLog(owner)).items;
    expect(await trail()).toEqual([["FILE_DOWNLOADED", "SUCCESS", admin.email]]);
    expect(entry.detail).toEqual({ path: "notes.txt", sizeBytes: fileContents("notes.txt")?.length });
  });

  it("records a remote command with what was asked for", async () => {
    const res = await as(admin).post(`${device()}/commands`, { type: "KILL_PROCESS", pid: 4242, name: "notepad.exe" });
    expect(res.status).toBe(202);

    const [entry] = (await auditLog(owner)).items;
    expect(await trail()).toEqual([["COMMAND_SENT", "SUCCESS", admin.email]]);
    expect(entry.detail).toEqual({ command: "KILL_PROCESS", pid: 4242, processName: "notepad.exe" });
  });

  it("records a live view's start and its end, with how long it lasted", async () => {
    const socket = await dashboard(admin);
    expect(await startLiveView(socket)).toEqual({ success: true });
    socket.emit("stream:stop", { deviceId: laptop });

    await vi.waitFor(async () => expect(await trail()).toHaveLength(2), { timeout: 5_000, interval: 50 });
    expect(await trail()).toEqual([
      ["LIVE_VIEW_STARTED", "SUCCESS", admin.email],
      ["LIVE_VIEW_ENDED", "SUCCESS", admin.email],
    ]);
    const [ended] = (await auditLog(owner, "?action=LIVE_VIEW_ENDED")).items;
    expect(ended.detail).toEqual({ reason: "STOPPED", durationSeconds: expect.any(Number) as number });
  });

  it("records the end of a live view whose tab was closed", async () => {
    const socket = await dashboard(owner);
    expect(await startLiveView(socket)).toEqual({ success: true });
    socket.disconnect();

    await vi.waitFor(
      async () => expect((await auditLog(owner, "?action=LIVE_VIEW_ENDED")).items.map((item) => item.detail?.reason)).toEqual(["DASHBOARD_CLOSED"]),
      { timeout: 5_000, interval: 50 },
    );
  });

  it("records a failed attempt with the reason", async () => {
    const token = accessTokenFor(admin);
    const res = await request(server).get(`${device()}/files/download?path=missing.txt&token=${token}`);
    expect(res.status).toBe(502);

    const [entry] = (await auditLog(owner)).items;
    expect(await trail()).toEqual([["FILE_DOWNLOADED", "FAILURE", admin.email]]);
    expect(entry.detail).toEqual({ path: "missing.txt", error: "File not found" });
  });

  it("records nothing for actions that were refused", async () => {
    expect((await as(viewer).post(`${device()}/screenshot`)).status).toBe(403);
    expect((await as(viewer).get(`${device()}/files`)).status).toBe(403);
    expect((await as(bravoOwner).post(`/api/orgs/${acme}/devices/${laptop}/screenshot`)).status).toBe(404);
    expect(await startLiveView(await dashboard(viewer))).toMatchObject({ success: false });

    expect(await trail()).toEqual([]);
  });

  it("doesn't record routine viewing: device status, metrics, processes, events", async () => {
    for (const path of ["", "/metrics", "/processes", "/commands"]) {
      expect((await as(owner).get(`${device()}${path}`)).status).toBe(200);
    }
    expect((await as(owner).get(`/api/orgs/${acme}/events`)).status).toBe(200);

    expect(await trail()).toEqual([]);
  });
});

describe("who can read the log", () => {
  it("lets owners and admins read it, newest first, with who did it", async () => {
    await as(admin).post(`${device()}/screenshot`);
    await as(owner).get(`${device()}/files`);

    for (const reader of [owner, admin]) {
      const log = await auditLog(reader);
      expect(log.items.map((item) => [item.action, item.actor?.email, item.deviceName])).toEqual([
        ["FILES_LISTED", owner.email, "Acme laptop"],
        ["SCREENSHOT_CAPTURED", admin.email, "Acme laptop"],
      ]);
    }
  });

  it("refuses viewers", async () => {
    const res = await as(viewer).get(`/api/orgs/${acme}/audit`);
    expect(res.status).toBe(403);
  });

  it("hides one organization's log from another", async () => {
    await as(admin).post(`${device()}/screenshot`);

    expect((await as(bravoOwner).get(`/api/orgs/${acme}/audit`)).status).toBe(404);
    const own = await as(bravoOwner).get(`/api/orgs/${bravo}/audit`);
    expect((own.body as { data: { items: unknown[] } }).data.items).toEqual([]);
  });

  it("filters by action, person, device and time", async () => {
    await as(admin).post(`${device()}/screenshot`);
    await as(owner).get(`${device()}/files`);
    const later = new Date(Date.now() + 60_000).toISOString();

    expect((await auditLog(owner, "?action=SCREENSHOT_CAPTURED")).items.map((item) => item.actorEmail)).toEqual([admin.email]);
    expect((await auditLog(owner, `?actorId=${owner.id}`)).items.map((item) => item.action)).toEqual(["FILES_LISTED"]);
    expect((await auditLog(owner, `?deviceId=${laptop}`)).pagination.total).toBe(2);
    expect((await auditLog(owner, `?from=${later}`)).pagination.total).toBe(0);
    expect((await as(owner).get(`/api/orgs/${acme}/audit?from=${later}&to=2000-01-01T00:00:00Z`)).status).toBe(400);
  });
});

describe("keeping the record", () => {
  it("can't be changed, even directly in the database", async () => {
    await as(admin).post(`${device()}/screenshot`);
    const entry = await prisma.auditEvent.findFirstOrThrow();

    await expect(prisma.auditEvent.update({ where: { id: entry.id }, data: { outcome: "FAILURE" } })).rejects.toThrow(
      /append-only/,
    );
    // The in-memory test database drops its connection after any failed
    // statement (a real Postgres doesn't); let Prisma reconnect before the
    // next test.
    await prisma.$queryRaw`SELECT 1`.catch(() => undefined);
  });

  it("keeps entries readable after the person and the device are deleted", async () => {
    const leaver = await prisma.user.create({ data: { email: "leaver@acme.example", passwordHash: "not-used" } });
    const oldLaptop = await prisma.device.create({ data: { orgId: acme, name: "Old laptop", tokenHash: "old-laptop" } });
    await prisma.auditEvent.create({
      data: {
        orgId: acme,
        actorId: leaver.id,
        actorEmail: leaver.email,
        action: "SCREENSHOT_CAPTURED",
        outcome: "SUCCESS",
        deviceId: oldLaptop.id,
        deviceName: oldLaptop.name,
      },
    });

    await prisma.user.delete({ where: { id: leaver.id } });
    await prisma.device.delete({ where: { id: oldLaptop.id } });

    const [entry] = (await auditLog(owner)).items;
    expect(entry).toMatchObject({ actor: null, actorEmail: "leaver@acme.example", deviceName: "Old laptop" });
  });

  it("removes entries after 90 days and keeps the rest", async () => {
    const day = 86_400_000;
    const base = { orgId: acme, actorEmail: owner.email, action: "SCREENSHOT_CAPTURED", outcome: "SUCCESS" } as const;
    await prisma.auditEvent.createMany({
      data: [
        { ...base, occurredAt: new Date(Date.now() - 91 * day), deviceName: "too old" },
        { ...base, occurredAt: new Date(Date.now() - 89 * day), deviceName: "kept" },
      ],
    });

    expect(await pruneAuditLog()).toBe(1);
    expect((await prisma.auditEvent.findMany()).map((entry) => entry.deviceName)).toEqual(["kept"]);
  });
});
