import type { Application } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Managing members on a real Postgres: who can change roles and remove
// people, that an organization never loses its last owner, that a change
// applies on the very next request, and that each change is audited.

let database: TestDatabase;
let prisma: PrismaClient;
let app: Application;

type Person = { id: string; email: string };
let owner: Person;
let admin: Person;
let viewer: Person;
let bravoOwner: Person;
let acme: string;
let bravo: string;

beforeAll(async () => {
  database = await startTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ prisma } = await import("../../prisma/client"));
  app = (await import("../../app")).createApp();
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  await database.stop();
});

beforeEach(async () => {
  await database.reset();
  const person = (email: string, name: string) =>
    prisma.user.create({ data: { email, name, passwordHash: "not-used" }, select: { id: true, email: true } });
  owner = await person("olivia@acme.example", "Olivia");
  admin = await person("adam@acme.example", "Adam");
  viewer = await person("vera@acme.example", "Vera");
  bravoOwner = await person("bob@bravo.example", "Bob");

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
});

function as(user: Person) {
  const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
    patch: (url: string, body?: object) => request(app).patch(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}

const member = (user: Person, orgId = acme) => `/api/orgs/${orgId}/members/${user.id}`;

async function roleOf(user: Person, orgId = acme) {
  return (await prisma.membership.findUnique({ where: { userId_orgId: { userId: user.id, orgId } } }))?.role ?? null;
}

async function auditTrail() {
  const rows = await prisma.auditEvent.findMany({ where: { orgId: acme }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  return rows.map((row) => ({ action: row.action, actor: row.actorEmail, detail: row.detail, deviceId: row.deviceId }));
}

describe("changing roles", () => {
  it("lets an owner change a role, and records who changed whom from what to what", async () => {
    const res = await as(owner).patch(member(viewer), { role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(await roleOf(viewer)).toBe("ADMIN");

    expect(await auditTrail()).toEqual([
      {
        action: "MEMBER_ROLE_CHANGED",
        actor: owner.email,
        detail: { member: { id: viewer.id, email: viewer.email, name: "Vera" }, fromRole: "VIEWER", toRole: "ADMIN" },
        deviceId: null,
      },
    ]);
  });

  it("applies on the member's very next request", async () => {
    expect((await as(admin).get(`/api/orgs/${acme}/audit`)).status).toBe(200);

    await as(owner).patch(member(admin), { role: "VIEWER" });

    expect((await as(admin).get(`/api/orgs/${acme}/audit`)).status).toBe(403);
  });

  it("can make another owner, who can then step down the original", async () => {
    await as(owner).patch(member(admin), { role: "OWNER" });
    expect((await as(admin).patch(member(owner), { role: "ADMIN" })).status).toBe(200);
    expect(await roleOf(owner)).toBe("ADMIN");
  });

  it("never demotes the last owner", async () => {
    const res = await as(owner).patch(member(owner), { role: "ADMIN" });
    expect(res.status).toBe(409);
    expect(await roleOf(owner)).toBe("OWNER");
    expect(await auditTrail()).toEqual([]);
  });

  it("keeps one owner when two owners demote each other at the same moment", async () => {
    await prisma.membership.update({ where: { userId_orgId: { userId: admin.id, orgId: acme } }, data: { role: "OWNER" } });

    const results = await Promise.all([
      as(owner).patch(member(admin), { role: "ADMIN" }),
      as(admin).patch(member(owner), { role: "ADMIN" }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await prisma.membership.count({ where: { orgId: acme, role: "OWNER" } })).toBe(1);
  });

  it("records nothing when the role doesn't change", async () => {
    expect((await as(owner).patch(member(viewer), { role: "VIEWER" })).status).toBe(200);
    expect(await auditTrail()).toEqual([]);
  });

  it("is for owners only, and only within their own organization", async () => {
    expect((await as(admin).patch(member(viewer), { role: "ADMIN" })).status).toBe(403);
    expect((await as(viewer).patch(member(viewer), { role: "OWNER" })).status).toBe(403);
    expect((await as(bravoOwner).patch(member(viewer), { role: "OWNER" })).status).toBe(404);
    expect((await as(bravoOwner).patch(member(viewer, bravo), { role: "OWNER" })).status).toBe(404);
    expect(await roleOf(viewer)).toBe("VIEWER");
  });

  it("rejects unknown roles", async () => {
    expect((await as(owner).patch(member(viewer), { role: "SUPERUSER" })).status).toBe(400);
  });
});

describe("removing and leaving", () => {
  it("lets an owner remove a member, who loses access at once", async () => {
    expect((await as(owner).delete(member(viewer))).status).toBe(200);

    expect(await roleOf(viewer)).toBeNull();
    expect((await as(viewer).get(`/api/orgs/${acme}/devices`)).status).toBe(404);
    expect(await auditTrail()).toMatchObject([
      { action: "MEMBER_REMOVED", actor: owner.email, detail: { member: { email: viewer.email }, role: "VIEWER" } },
    ]);
  });

  it("lets anyone leave", async () => {
    expect((await as(viewer).delete(member(viewer))).status).toBe(200);

    expect(await roleOf(viewer)).toBeNull();
    expect(await auditTrail()).toMatchObject([{ action: "MEMBER_LEFT", actor: viewer.email }]);
  });

  it("doesn't let admins or viewers remove anyone else", async () => {
    expect((await as(admin).delete(member(viewer))).status).toBe(403);
    expect((await as(viewer).delete(member(admin))).status).toBe(403);
    expect(await prisma.membership.count({ where: { orgId: acme } })).toBe(3);
  });

  it("never lets the last owner leave or be removed", async () => {
    expect((await as(owner).delete(member(owner))).status).toBe(409);
    expect(await roleOf(owner)).toBe("OWNER");
  });

  it("can't reach another organization's members", async () => {
    expect((await as(bravoOwner).delete(member(viewer))).status).toBe(404);
    expect((await as(owner).delete(member(bravoOwner))).status).toBe(404);
    expect(await roleOf(viewer)).toBe("VIEWER");
    expect(await roleOf(bravoOwner, bravo)).toBe("OWNER");
  });

  it("doesn't let anyone leave the shared demo organization", async () => {
    await prisma.organization.update({ where: { id: acme }, data: { isDemo: true } });

    expect((await as(admin).delete(member(admin))).status).toBe(403);
    expect(await roleOf(admin)).toBe("ADMIN");
  });
});

describe("invites in the audit log", () => {
  it("records each invite created, revoked and accepted", async () => {
    const first = await as(owner).post(`/api/orgs/${acme}/invites`, { role: "ADMIN", note: "Sam" });
    const { token, invitation } = (first.body as { data: { token: string; invitation: { id: string } } }).data;
    const second = await as(owner).post(`/api/orgs/${acme}/invites`, { role: "VIEWER" });
    const revokedId = (second.body as { data: { invitation: { id: string } } }).data.invitation.id;

    await as(owner).delete(`/api/orgs/${acme}/invites/${revokedId}`);
    await request(app).post("/api/auth/signup").send({
      name: "Sam",
      email: "sam@example.com",
      password: "a-long-enough-password",
      inviteToken: token,
    });

    expect(invitation.id).toEqual(expect.any(String));
    expect(await auditTrail()).toMatchObject([
      { action: "MEMBER_INVITED", actor: owner.email, detail: { role: "ADMIN", note: "Sam" } },
      { action: "MEMBER_INVITED", actor: owner.email, detail: { role: "VIEWER", note: null } },
      { action: "INVITE_REVOKED", actor: owner.email, detail: { role: "VIEWER" } },
      { action: "MEMBER_JOINED", actor: "sam@example.com", detail: { role: "ADMIN" } },
    ]);
  });

  it("records a signed-in member joining through a link", async () => {
    const created = await as(owner).post(`/api/orgs/${acme}/invites`, { role: "VIEWER" });
    const { token } = (created.body as { data: { token: string } }).data;

    await as(bravoOwner).post(`/api/invites/${token}/accept`);

    expect((await auditTrail()).at(-1)).toMatchObject({ action: "MEMBER_JOINED", actor: bravoOwner.email, detail: { role: "VIEWER" } });
  });
});
