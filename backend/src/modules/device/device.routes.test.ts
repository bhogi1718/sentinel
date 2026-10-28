import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../organization/organization.repository", () => ({
  organizationRepository: { findMembership: vi.fn() },
}));
vi.mock("./device.repository", () => ({
  deviceRepository: { findInOrg: vi.fn(), listForOrg: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));
vi.mock("../command/command.service", () => ({
  commandService: { sendCommand: vi.fn(), listForDevice: vi.fn() },
}));
vi.mock("../process/process.service", () => ({ processService: { listProcesses: vi.fn() } }));
vi.mock("../metrics/metrics.service", () => ({ metricsService: { getMetrics: vi.fn() } }));
vi.mock("../screenshot/screenshot.service", () => ({ screenshotService: { capture: vi.fn() } }));
vi.mock("../file/file.service", () => ({ fileService: { listFiles: vi.fn(), startDownload: vi.fn() } }));
vi.mock("../event/event.repository", () => ({ eventRepository: { findMany: vi.fn() } }));
vi.mock("../settings/settings.service", () => ({
  settingsService: { getIntegrationStatus: vi.fn(), connectTelegram: vi.fn(), disconnectTelegram: vi.fn() },
}));

import { OrgRole } from "@prisma/client";
import { createApp } from "../../app";
import { accessTokenFor } from "../../test/authTokens";
import { commandService } from "../command/command.service";
import { eventRepository } from "../event/event.repository";
import { fileService } from "../file/file.service";
import { metricsService } from "../metrics/metrics.service";
import { organizationRepository } from "../organization/organization.repository";
import { processService } from "../process/process.service";
import { screenshotService } from "../screenshot/screenshot.service";
import { settingsService } from "../settings/settings.service";
import { deviceRepository } from "./device.repository";
import { OrgDevice } from "./device.types";

const mockedOrgRepo = vi.mocked(organizationRepository, true);
const mockedDeviceRepo = vi.mocked(deviceRepository, true);

const app = createApp();
const USER = { id: "user-1", email: "user@example.com" };
const TOKEN = accessTokenFor(USER);
const auth = { Authorization: `Bearer ${TOKEN}` };

const ORG = "org-1";
const DEVICE: OrgDevice = {
  id: "device-1",
  orgId: ORG,
  name: "Laptop",
  isOnline: true,
  lastSeenAt: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};
const BASE = `/api/orgs/${ORG}/devices/${DEVICE.id}`;

function memberAs(role: OrgRole) {
  mockedOrgRepo.findMembership.mockResolvedValue({ role, org: { id: ORG, name: "Acme", slug: "acme" } } as never);
}

interface DeviceRoute {
  name: string;
  send: () => request.Test;
  allowedFor: OrgRole;
}

// Every route that acts on one device, with the lowest role allowed to use it.
const DEVICE_ROUTES: DeviceRoute[] = [
  { name: "GET device", send: () => request(app).get(BASE).set(auth), allowedFor: "VIEWER" },
  { name: "DELETE device", send: () => request(app).delete(BASE).set(auth), allowedFor: "ADMIN" },
  { name: "GET commands", send: () => request(app).get(`${BASE}/commands`).set(auth), allowedFor: "VIEWER" },
  { name: "GET processes", send: () => request(app).get(`${BASE}/processes`).set(auth), allowedFor: "VIEWER" },
  { name: "GET metrics", send: () => request(app).get(`${BASE}/metrics`).set(auth), allowedFor: "VIEWER" },
  {
    name: "POST commands",
    send: () => request(app).post(`${BASE}/commands`).set(auth).send({ type: "LOCK" }),
    allowedFor: "ADMIN",
  },
  { name: "GET files", send: () => request(app).get(`${BASE}/files`).set(auth), allowedFor: "ADMIN" },
  { name: "POST screenshot", send: () => request(app).post(`${BASE}/screenshot`).set(auth), allowedFor: "ADMIN" },
  {
    name: "GET files/download",
    send: () => request(app).get(`${BASE}/files/download`).query({ path: "notes.txt", token: TOKEN }),
    allowedFor: "ADMIN",
  },
];

const ROLE_RANK: Record<OrgRole, number> = { VIEWER: 0, ADMIN: 1, OWNER: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedDeviceRepo.findInOrg.mockResolvedValue(DEVICE);
  mockedDeviceRepo.delete.mockResolvedValue(true);
  vi.mocked(commandService.listForDevice).mockResolvedValue({ items: [], pagination: {} } as never);
  vi.mocked(commandService.sendCommand).mockResolvedValue({ id: "cmd-1" } as never);
  vi.mocked(processService.listProcesses).mockResolvedValue([]);
  vi.mocked(metricsService.getMetrics).mockResolvedValue({} as never);
  vi.mocked(screenshotService.capture).mockResolvedValue(Buffer.from("png"));
  vi.mocked(fileService.listFiles).mockResolvedValue([]);
  vi.mocked(fileService.startDownload).mockImplementation((_device, _path, handlers) => {
    handlers.onComplete();
    return Promise.resolve();
  });
});

describe("device routes: role matrix", () => {
  for (const route of DEVICE_ROUTES) {
    for (const role of ["VIEWER", "ADMIN", "OWNER"] as const) {
      const allowed = ROLE_RANK[role] >= ROLE_RANK[route.allowedFor];
      it(`${route.name} as ${role} -> ${allowed ? "allowed" : "403"}`, async () => {
        memberAs(role);
        const res = await route.send();
        if (allowed) {
          expect(res.status).toBeLessThan(400);
        } else {
          expect(res.status).toBe(403);
        }
      });
    }
  }
});

describe("device routes: tenant isolation", () => {
  for (const route of DEVICE_ROUTES) {
    it(`${route.name} for a device in another organization -> 404`, async () => {
      memberAs("OWNER");
      mockedDeviceRepo.findInOrg.mockResolvedValue(null);

      const res = await route.send();

      expect(res.status).toBe(404);
      expect(mockedDeviceRepo.findInOrg).toHaveBeenCalledWith(ORG, DEVICE.id);
    });

    it(`${route.name} in an organization the caller isn't in -> 404`, async () => {
      mockedOrgRepo.findMembership.mockResolvedValue(null);

      const res = await route.send();

      expect(res.status).toBe(404);
      expect(mockedDeviceRepo.findInOrg).not.toHaveBeenCalled();
    });
  }

  it("hands services the device that was authorized, and the requester from the token", async () => {
    memberAs("ADMIN");

    await request(app).post(`${BASE}/commands`).set(auth).send({ type: "LOCK" }).expect(202);

    // isOnline reflects live presence (no agent is connected in this test),
    // not the stored row.
    expect(commandService.sendCommand).toHaveBeenCalledWith({ ...DEVICE, isOnline: false }, { type: "LOCK" }, USER.id);
  });
});

describe("device routes: authentication", () => {
  it("rejects header-authenticated routes without a token", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("rejects a download without the query token, even with an Authorization header", async () => {
    const res = await request(app).get(`${BASE}/files/download`).query({ path: "notes.txt" }).set(auth);
    expect(res.status).toBe(401);
  });

  it("no longer serves the old single-device routes", async () => {
    const res = await request(app).get("/api/device/status").set(auth);
    expect(res.status).toBe(404);
  });
});

describe("GET/POST /api/orgs/:orgId/devices", () => {
  it("lists only the organization's devices", async () => {
    memberAs("VIEWER");
    mockedDeviceRepo.listForOrg.mockResolvedValue([DEVICE]);

    const res = await request(app).get(`/api/orgs/${ORG}/devices`).set(auth);

    expect(res.status).toBe(200);
    expect(mockedDeviceRepo.listForOrg).toHaveBeenCalledWith(ORG);
  });

  it("does not let a VIEWER add a device", async () => {
    memberAs("VIEWER");

    const res = await request(app).post(`/api/orgs/${ORG}/devices`).set(auth).send({ name: "New laptop" });

    expect(res.status).toBe(403);
    expect(mockedDeviceRepo.create).not.toHaveBeenCalled();
  });

  it("creates a device in the organization and returns its token once, never its hash", async () => {
    memberAs("ADMIN");
    mockedDeviceRepo.create.mockResolvedValue({ ...DEVICE, name: "New laptop" });

    const res = await request(app).post(`/api/orgs/${ORG}/devices`).set(auth).send({ name: "  New laptop " });

    expect(res.status).toBe(201);
    const body = res.body as { data: { device: Record<string, unknown>; token: string } };
    expect(body.data.token).toMatch(/^[0-9a-f]{96}$/);
    expect(body.data.device).not.toHaveProperty("tokenHash");

    const createArgs = mockedDeviceRepo.create.mock.calls[0][0];
    expect(createArgs.orgId).toBe(ORG);
    expect(createArgs.name).toBe("New laptop");
    expect(createArgs.tokenHash).not.toBe(body.data.token);
  });
});

describe("GET /api/orgs/:orgId/events", () => {
  it("always scopes the query to the organization in the URL", async () => {
    memberAs("VIEWER");
    vi.mocked(eventRepository.findMany).mockResolvedValue({ items: [], total: 0 });

    const res = await request(app)
      .get(`/api/orgs/${ORG}/events`)
      .query({ deviceId: "8d3c4f1e-2b7a-4c9d-9e1f-0a2b3c4d5e6f" })
      .set(auth);

    expect(res.status).toBe(200);
    expect(eventRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, deviceId: "8d3c4f1e-2b7a-4c9d-9e1f-0a2b3c4d5e6f" }),
    );
  });
});

describe("/api/orgs/:orgId/settings", () => {
  it("lets a VIEWER see integration status for their organization", async () => {
    memberAs("VIEWER");
    vi.mocked(settingsService.getIntegrationStatus).mockResolvedValue({ telegram: { connected: false } });

    const res = await request(app).get(`/api/orgs/${ORG}/settings/integrations`).set(auth);

    expect(res.status).toBe(200);
    expect(settingsService.getIntegrationStatus).toHaveBeenCalledWith(ORG);
  });

  it("does not let a VIEWER change integrations", async () => {
    memberAs("VIEWER");

    const res = await request(app)
      .post(`/api/orgs/${ORG}/settings/integrations/telegram`)
      .set(auth)
      .send({ botToken: "t", chatId: "c" });

    expect(res.status).toBe(403);
    expect(settingsService.connectTelegram).not.toHaveBeenCalled();
  });
});
