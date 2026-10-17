import express, { Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/organization/organization.repository", () => ({
  organizationRepository: { findMembership: vi.fn() },
}));

vi.mock("../modules/device/device.repository", () => ({
  deviceRepository: { findInOrg: vi.fn() },
}));

import { deviceRepository } from "../modules/device/device.repository";
import { organizationRepository } from "../modules/organization/organization.repository";
import { accessTokenFor } from "../test/authTokens";
import { authGuard } from "./authGuard";
import { deviceContext } from "./deviceContext";
import { errorHandler } from "./errorHandler";
import { orgContext } from "./orgContext";
import { requirePermission } from "./requirePermission";

const mockedOrgRepo = vi.mocked(organizationRepository, true);
const mockedDeviceRepo = vi.mocked(deviceRepository, true);

const USER = { id: "user-1", email: "user@example.com" };
const auth = { Authorization: `Bearer ${accessTokenFor(USER)}` };

const DEVICE = {
  id: "device-1",
  orgId: "org-1",
  name: "Laptop",
  isOnline: true,
  lastSeenAt: null,
  createdAt: new Date(),
};

// The same chain a real device route uses, ending in a handler that echoes
// what the middlewares attached.
function buildApp() {
  const app = express();
  const echo = (req: Request, res: Response) => {
    res.json({ org: req.org, device: req.device ?? null });
  };

  app.get(
    "/orgs/:orgId/devices/:deviceId/lock",
    authGuard,
    orgContext,
    requirePermission("commands:send"),
    deviceContext,
    echo,
  );
  app.get("/orgs/:orgId/devices/:deviceId", authGuard, orgContext, requirePermission("devices:view"), deviceContext, echo);
  // Misconfigured on purpose: requirePermission without orgContext.
  app.get("/broken/:orgId", authGuard, requirePermission("org:view"), echo);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

interface EchoBody {
  org?: unknown;
  device?: Record<string, unknown> | null;
  error?: { code: string; message: string };
}

function bodyOf(res: request.Response): EchoBody {
  return res.body as EchoBody;
}

function memberAs(role: "VIEWER" | "ADMIN" | "OWNER") {
  mockedOrgRepo.findMembership.mockResolvedValue({ role, org: { id: "org-1", name: "Acme", slug: "acme" } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orgContext", () => {
  it("attaches the caller's role in the organization from the URL", async () => {
    memberAs("ADMIN");
    mockedDeviceRepo.findInOrg.mockResolvedValue(DEVICE);

    const res = await request(app).get("/orgs/org-1/devices/device-1").set(auth);

    expect(res.status).toBe(200);
    expect(mockedOrgRepo.findMembership).toHaveBeenCalledWith(USER.id, "org-1");
    expect(bodyOf(res).org).toEqual({ id: "org-1", name: "Acme", slug: "acme", role: "ADMIN" });
  });

  it("returns 404, not 403, to a non-member, and goes no further", async () => {
    mockedOrgRepo.findMembership.mockResolvedValue(null);

    const res = await request(app).get("/orgs/org-2/devices/device-1/lock").set(auth);

    expect(res.status).toBe(404);
    expect(mockedDeviceRepo.findInOrg).not.toHaveBeenCalled();
  });
});

describe("requirePermission", () => {
  it("returns 403 to a member whose role is too low", async () => {
    memberAs("VIEWER");

    const res = await request(app).get("/orgs/org-1/devices/device-1/lock").set(auth);

    expect(res.status).toBe(403);
    expect(bodyOf(res).error?.code).toBe("FORBIDDEN");
    expect(mockedDeviceRepo.findInOrg).not.toHaveBeenCalled();
  });

  it("lets a member with a high enough role through", async () => {
    memberAs("ADMIN");
    mockedDeviceRepo.findInOrg.mockResolvedValue(DEVICE);

    const res = await request(app).get("/orgs/org-1/devices/device-1/lock").set(auth);

    expect(res.status).toBe(200);
  });

  it("fails closed with a 500 when a route forgot orgContext", async () => {
    const res = await request(app).get("/broken/org-1").set(auth);

    expect(res.status).toBe(500);
  });
});

describe("deviceContext", () => {
  it("looks the device up scoped to the organization and attaches it", async () => {
    memberAs("VIEWER");
    mockedDeviceRepo.findInOrg.mockResolvedValue(DEVICE);

    const res = await request(app).get("/orgs/org-1/devices/device-1").set(auth);

    expect(res.status).toBe(200);
    expect(mockedDeviceRepo.findInOrg).toHaveBeenCalledWith("org-1", "device-1");
    expect(bodyOf(res).device).toMatchObject({ id: "device-1", orgId: "org-1", name: "Laptop" });
    expect(bodyOf(res).device).not.toHaveProperty("tokenHash");
  });

  it("returns 404 for a device that belongs to another organization", async () => {
    memberAs("OWNER");
    mockedDeviceRepo.findInOrg.mockResolvedValue(null);

    const res = await request(app).get("/orgs/org-1/devices/device-of-another-org").set(auth);

    expect(res.status).toBe(404);
    expect(bodyOf(res).error?.message).toBe("Device not found");
  });
});
