import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./organization.repository", () => ({
  organizationRepository: {
    listMembershipsForUser: vi.fn(),
    findMembership: vi.fn(),
    listMembers: vi.fn(),
  },
}));

import { createApp } from "../../app";
import { permissionsFor } from "../../common/permissions";
import { accessTokenFor } from "../../test/authTokens";
import { organizationRepository } from "./organization.repository";

const mockedRepo = vi.mocked(organizationRepository, true);

function dataOf(res: request.Response): unknown {
  return (res.body as { data: unknown }).data;
}

const app = createApp();
const ALICE = { id: "user-alice", email: "alice@example.com" };
const ACME = { id: "org-acme", name: "Acme", slug: "acme" };
const auth = { Authorization: `Bearer ${accessTokenFor(ALICE)}` };

function membership(role: "VIEWER" | "ADMIN" | "OWNER", org = ACME) {
  return { id: `m-${org.id}`, userId: ALICE.id, orgId: org.id, role, createdAt: new Date(), org } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/orgs", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/orgs");
    expect(res.status).toBe(401);
    expect(mockedRepo.listMembershipsForUser).not.toHaveBeenCalled();
  });

  it("lists the caller's organizations with their role and resolved permissions", async () => {
    const other = { id: "org-other", name: "Other", slug: "other" };
    mockedRepo.listMembershipsForUser.mockResolvedValue([membership("OWNER"), membership("VIEWER", other)]);

    const res = await request(app).get("/api/orgs").set(auth);

    expect(res.status).toBe(200);
    expect(mockedRepo.listMembershipsForUser).toHaveBeenCalledWith(ALICE.id);
    expect(dataOf(res)).toEqual([
      { ...ACME, role: "OWNER", permissions: permissionsFor("OWNER") },
      { ...other, role: "VIEWER", permissions: permissionsFor("VIEWER") },
    ]);
  });
});

describe("GET /api/orgs/:orgId", () => {
  it("returns the organization to a member, checked against the caller from the token", async () => {
    mockedRepo.findMembership.mockResolvedValue(membership("ADMIN"));

    const res = await request(app).get(`/api/orgs/${ACME.id}`).set(auth);

    expect(res.status).toBe(200);
    // One lookup, in orgContext - the handler reuses it.
    expect(mockedRepo.findMembership).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findMembership).toHaveBeenCalledWith(ALICE.id, ACME.id);
    expect(dataOf(res)).toEqual({ ...ACME, role: "ADMIN", permissions: permissionsFor("ADMIN") });
  });

  it("answers a non-member exactly like an organization that doesn't exist", async () => {
    mockedRepo.findMembership.mockResolvedValue(null);

    const res = await request(app).get("/api/orgs/org-someone-else").set(auth);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: "Organization not found" } });
  });

  it("requires authentication before looking anything up", async () => {
    const res = await request(app).get(`/api/orgs/${ACME.id}`);
    expect(res.status).toBe(401);
    expect(mockedRepo.findMembership).not.toHaveBeenCalled();
  });
});

describe("GET /api/orgs/:orgId/members", () => {
  it("lets a VIEWER see who else is in the organization", async () => {
    mockedRepo.findMembership.mockResolvedValue(membership("VIEWER"));
    const joinedAt = new Date("2026-10-01T00:00:00.000Z");
    mockedRepo.listMembers.mockResolvedValue([
      { role: "OWNER", createdAt: joinedAt, user: { id: "user-bob", email: "bob@example.com", name: "Bob" } },
    ] as never);

    const res = await request(app).get(`/api/orgs/${ACME.id}/members`).set(auth);

    expect(res.status).toBe(200);
    expect(mockedRepo.listMembers).toHaveBeenCalledWith(ACME.id);
    expect(dataOf(res)).toEqual([
      { userId: "user-bob", email: "bob@example.com", name: "Bob", role: "OWNER", joinedAt: joinedAt.toISOString() },
    ]);
  });

  it("never lists members of an organization the caller isn't in", async () => {
    mockedRepo.findMembership.mockResolvedValue(null);

    const res = await request(app).get("/api/orgs/org-someone-else/members").set(auth);

    expect(res.status).toBe(404);
    expect(mockedRepo.listMembers).not.toHaveBeenCalled();
  });
});
