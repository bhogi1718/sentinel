import type { PrismaClient } from "@prisma/client";
import type { Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// The public demo end to end: a real database, a real listening server, and
// the simulated device connected to it exactly like a real agent. Checks
// that a demo session reaches the demo and nothing else, that the simulated
// device answers like a real one, and that demo visitors can't change the
// shared demo for everyone.

let database: TestDatabase;
let prisma: PrismaClient;
let server: HttpServer;
let stopSimulator: () => void;
let demo: typeof import("../../demo/demoSetup");

let realOrgId: string;
let demoOrgId: string;
let demoDeviceId: string;

beforeAll(async () => {
  database = await startTestDatabase();
  process.env.DATABASE_URL = database.url;
  process.env.DEMO_MODE = "true";

  ({ prisma } = await import("../../prisma/client"));
  demo = await import("../../demo/demoSetup");
  const { createApp } = await import("../../app");
  const { initSocketServer } = await import("../../realtime/socket");
  const { startDemoSimulator } = await import("../../demo/simulator");
  const { createServer } = await import("http");

  // A real organization the demo must never be able to reach.
  const owner = await prisma.user.create({ data: { email: "owner@real.example", passwordHash: "not-used" } });
  const realOrg = await prisma.organization.create({ data: { name: "Real Co", slug: "real-co" } });
  await prisma.membership.create({ data: { userId: owner.id, orgId: realOrg.id, role: "OWNER" } });
  realOrgId = realOrg.id;

  server = createServer(createApp());
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  const prepared = await demo.prepareDemo();
  demoOrgId = prepared.orgId;
  demoDeviceId = prepared.deviceId;
  const simulator = startDemoSimulator({
    serverUrl: `http://127.0.0.1:${port}`,
    deviceToken: prepared.deviceToken,
    commandDelayMs: 50,
  });
  stopSimulator = () => simulator.stop();
}, 60_000);

afterAll(async () => {
  stopSimulator?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  await database.stop();
});

async function demoSession() {
  const res = await request(server).post("/api/demo/session");
  expect(res.status).toBe(201);
  const { accessToken } = (res.body as { data: { accessToken: string } }).data;
  return { Authorization: `Bearer ${accessToken}` };
}

describe("demo session", () => {
  it("is advertised as enabled", async () => {
    const res = await request(server).get("/api/demo");
    expect((res.body as { data: { enabled: boolean } }).data).toEqual({ enabled: true });
  });

  it("reaches the demo organization and nothing else", async () => {
    const auth = await demoSession();

    const orgs = await request(server).get("/api/orgs").set(auth);
    const list = (orgs.body as { data: { id: string; isDemo: boolean; permissions: string[] }[] }).data;
    expect(list.map((org) => org.id)).toEqual([demoOrgId]);
    expect(list[0].isDemo).toBe(true);
    expect(list[0].permissions).toContain("commands:send");
    expect(list[0].permissions).not.toContain("devices:manage");

    expect((await request(server).get(`/api/orgs/${realOrgId}`).set(auth)).status).toBe(404);
    expect((await request(server).get(`/api/orgs/${realOrgId}/devices`).set(auth)).status).toBe(404);
  });

  it("can't change the shared demo for other visitors", async () => {
    const auth = await demoSession();

    const addDevice = await request(server).post(`/api/orgs/${demoOrgId}/devices/pairing-codes`).set(auth).send({ name: "Mine now" });
    expect(addDevice.status).toBe(403);

    const disconnect = await request(server).delete(`/api/orgs/${demoOrgId}/settings/integrations/telegram`).set(auth);
    expect(disconnect.status).toBe(403);

    const password = await request(server)
      .post("/api/auth/change-password")
      .set(auth)
      .send({ currentPassword: "anything-at-all", newPassword: "a-new-password-123" });
    expect(password.status).toBe(403);
  });
});

describe("the simulated device", () => {
  it("connects like a real agent and shows as online", async () => {
    const auth = await demoSession();

    await vi.waitFor(
      async () => {
        const res = await request(server).get(`/api/orgs/${demoOrgId}/devices/${demoDeviceId}`).set(auth);
        expect((res.body as { data: { isOnline: boolean } }).data.isOnline).toBe(true);
      },
      { timeout: 10_000, interval: 200 },
    );
  });

  it("answers metrics, process, file and screenshot requests", async () => {
    const auth = await demoSession();
    const base = `/api/orgs/${demoOrgId}/devices/${demoDeviceId}`;

    const metrics = await request(server).get(`${base}/metrics`).set(auth);
    expect(metrics.status).toBe(200);
    expect((metrics.body as { data: { cpuPercent: number } }).data.cpuPercent).toBeGreaterThan(0);

    const processes = await request(server).get(`${base}/processes`).set(auth);
    expect((processes.body as { data: unknown[] }).data.length).toBeGreaterThan(5);

    const files = await request(server).get(`${base}/files`).query({ path: "Documents" }).set(auth);
    expect((files.body as { data: { name: string }[] }).data.map((entry) => entry.name)).toContain("Q3 report.docx");

    const screenshot = await request(server).post(`${base}/screenshot`).set(auth);
    expect(screenshot.status).toBe(200);
    expect(screenshot.headers["content-type"]).toContain("image/png");
  });

  it("acknowledges a command and records who sent it", async () => {
    const auth = await demoSession();
    const base = `/api/orgs/${demoOrgId}/devices/${demoDeviceId}`;

    const sent = await request(server).post(`${base}/commands`).set(auth).send({ type: "LOCK" });
    expect(sent.status).toBe(202);

    await vi.waitFor(
      async () => {
        const history = await request(server).get(`${base}/commands`).set(auth);
        const latest = (history.body as { data: { items: { status: string; requestedBy: { email: string } }[] } }).data
          .items[0];
        expect(latest.status).toBe("ACKNOWLEDGED");
        expect(latest.requestedBy.email).toBe(demo.DEMO_USER.email);
      },
      { timeout: 10_000, interval: 200 },
    );
  });

  it("reports its events into the demo organization only", async () => {
    await vi.waitFor(
      async () => {
        expect(await prisma.event.count({ where: { orgId: demoOrgId } })).toBeGreaterThan(0);
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(await prisma.event.count({ where: { orgId: realOrgId } })).toBe(0);
  });
});

describe("demo setup", () => {
  it("is idempotent and keeps the same organization", async () => {
    const again = await demo.prepareDemo();
    expect(again.orgId).toBe(demoOrgId);
    expect(await prisma.organization.count({ where: { isDemo: true } })).toBe(1);
    // A fresh token each start; the earlier one no longer authenticates.
    stopSimulator();
  });

  it("refuses to turn a real organization into the demo", async () => {
    await prisma.organization.update({ where: { id: demoOrgId }, data: { isDemo: false } });
    await expect(demo.prepareDemo()).rejects.toThrow(/not a demo organization/);
  });
});
