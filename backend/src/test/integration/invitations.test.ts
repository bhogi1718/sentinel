import type { Application } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Invite links end to end on a real Postgres: who can create and revoke
// them, that each works exactly once, that every dead link fails the same
// way, and that one organization can't see or touch another's.

let database: TestDatabase;
let prisma: PrismaClient;
let app: Application;

type Person = { id: string; email: string };
let owner: Person;
let admin: Person;
let viewer: Person;
let bravoOwner: Person;
let outsider: Person;
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
  const person = (email: string) =>
    prisma.user.create({ data: { email, passwordHash: "not-used" }, select: { id: true, email: true } });
  owner = await person("olivia@acme.example");
  admin = await person("adam@acme.example");
  viewer = await person("vera@acme.example");
  bravoOwner = await person("bob@bravo.example");
  outsider = await person("oscar@elsewhere.example");

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
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}

function dataOf<T>(res: request.Response): T {
  return (res.body as { data: T }).data;
}

async function invite(role: "ADMIN" | "VIEWER" = "VIEWER", note?: string) {
  const res = await as(owner).post(`/api/orgs/${acme}/invites`, { role, note });
  expect(res.status).toBe(201);
  return dataOf<{ token: string; invitation: { id: string; role: string; note: string | null } }>(res);
}

async function roleIn(user: Person, orgId: string) {
  return (await prisma.membership.findUnique({ where: { userId_orgId: { userId: user.id, orgId } } }))?.role ?? null;
}

describe("creating and listing invites", () => {
  it("gives the owner a link once, and lists it as pending without the token", async () => {
    const { token, invitation } = await invite("ADMIN", "Sam from finance");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitation).toMatchObject({ role: "ADMIN", note: "Sam from finance" });

    const list = await as(owner).get(`/api/orgs/${acme}/invites`);
    const pending = dataOf<Record<string, unknown>[]>(list);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: invitation.id, role: "ADMIN", createdBy: { email: owner.email } });
    expect(JSON.stringify(pending)).not.toContain(token);

    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);
  });

  it("is for owners only", async () => {
    for (const member of [admin, viewer]) {
      expect((await as(member).post(`/api/orgs/${acme}/invites`, { role: "VIEWER" })).status).toBe(403);
      expect((await as(member).get(`/api/orgs/${acme}/invites`)).status).toBe(403);
    }
    expect((await as(bravoOwner).post(`/api/orgs/${acme}/invites`, { role: "VIEWER" })).status).toBe(404);
    expect(await prisma.invitation.count()).toBe(0);
  });

  it("can't invite an owner", async () => {
    expect((await as(owner).post(`/api/orgs/${acme}/invites`, { role: "OWNER" })).status).toBe(400);
  });

  it("caps pending invites per organization", async () => {
    await prisma.invitation.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        orgId: acme,
        role: "VIEWER" as const,
        tokenHash: `hash-${i}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    });
    expect((await as(owner).post(`/api/orgs/${acme}/invites`, { role: "VIEWER" })).status).toBe(409);
  });
});

describe("following a link", () => {
  it("shows the organization and role, and nothing else, without signing in", async () => {
    const { token } = await invite("ADMIN");

    const res = await request(app).get(`/api/invites/${token}`);
    expect(res.status).toBe(200);
    expect(dataOf(res)).toEqual({ organizationName: "Acme", role: "ADMIN" });
  });

  it("joins a signed-in person with the invite's role, exactly once", async () => {
    const { token } = await invite("ADMIN");

    const accept = await as(outsider).post(`/api/invites/${token}/accept`);
    expect(accept.status).toBe(200);
    expect(dataOf(accept)).toEqual({ orgId: acme, alreadyMember: false });
    expect(await roleIn(outsider, acme)).toBe("ADMIN");

    // Used: neither the same person nor anyone else can use it again.
    expect((await as(bravoOwner).post(`/api/invites/${token}/accept`)).status).toBe(404);
    expect(await roleIn(bravoOwner, acme)).toBeNull();
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404);
    expect((await as(owner).get(`/api/orgs/${acme}/invites`)).body).toMatchObject({ data: [] });
  });

  it("lets only one of two simultaneous accepts succeed", async () => {
    const { token } = await invite();

    const results = await Promise.all([
      as(outsider).post(`/api/invites/${token}/accept`),
      as(bravoOwner).post(`/api/invites/${token}/accept`),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 404]);
    expect(await prisma.membership.count({ where: { orgId: acme } })).toBe(4);
  });

  it("sends an existing member to the organization and leaves the invite for someone else", async () => {
    const { token } = await invite("ADMIN");

    const res = await as(viewer).post(`/api/invites/${token}/accept`);
    expect(dataOf(res)).toEqual({ orgId: acme, alreadyMember: true });
    expect(await roleIn(viewer, acme)).toBe("VIEWER");
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(200);
  });

  it("answers an unknown, expired, used and revoked link identically", async () => {
    const used = await invite();
    await as(outsider).post(`/api/invites/${used.token}/accept`);

    const revoked = await invite();
    expect((await as(owner).delete(`/api/orgs/${acme}/invites/${revoked.invitation.id}`)).status).toBe(200);

    const expired = await invite();
    await prisma.invitation.update({ where: { id: expired.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const unknown = "A".repeat(43);
    const answers = await Promise.all(
      [used.token, revoked.token, expired.token, unknown].map((token) => request(app).get(`/api/invites/${token}`)),
    );
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual(answers[3].body);
    }

    for (const token of [revoked.token, expired.token]) {
      expect((await as(bravoOwner).post(`/api/invites/${token}/accept`)).status).toBe(404);
    }
    expect(await roleIn(bravoOwner, acme)).toBeNull();
  });

  it("rejects a malformed link before looking anything up", async () => {
    expect((await request(app).get("/api/invites/not-a-token")).status).toBe(400);
  });

  it("needs an account to accept", async () => {
    const { token } = await invite();
    expect((await request(app).post(`/api/invites/${token}/accept`)).status).toBe(401);
  });

  it("refuses the shared demo account", async () => {
    const { token } = await invite();
    const demo = await prisma.user.create({
      data: { email: "visitor@demo.sentinel.invalid", passwordHash: "not-used" },
      select: { id: true, email: true },
    });

    expect((await as(demo).post(`/api/invites/${token}/accept`)).status).toBe(403);
    expect(await roleIn(demo, acme)).toBeNull();
  });
});

describe("signing up from a link", () => {
  const newcomer = { name: "Sam Lee", email: "sam@example.com", password: "a-long-enough-password" };

  it("joins the organization with the invite's role and gets no organization of its own", async () => {
    const { token } = await invite("ADMIN");

    const res = await request(app).post("/api/auth/signup").send({ ...newcomer, inviteToken: token, organizationName: "Ignored" });
    expect(res.status).toBe(201);

    const sam = await prisma.user.findUniqueOrThrow({ where: { email: "sam@example.com" }, include: { memberships: true } });
    expect(sam.memberships.map((m) => [m.orgId, m.role])).toEqual([[acme, "ADMIN"]]);
    expect(await prisma.organization.count()).toBe(2);
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404);
  });

  it("creates no account when the link is no longer valid", async () => {
    const { token, invitation } = await invite();
    await as(owner).delete(`/api/orgs/${acme}/invites/${invitation.id}`);

    const res = await request(app).post("/api/auth/signup").send({ ...newcomer, inviteToken: token });
    expect(res.status).toBe(404);
    expect(await prisma.user.count({ where: { email: "sam@example.com" } })).toBe(0);
  });
});

describe("revoking", () => {
  it("only works on the owner's own organization's invites", async () => {
    const { invitation } = await invite();

    expect((await as(bravoOwner).delete(`/api/orgs/${bravo}/invites/${invitation.id}`)).status).toBe(404);
    expect((await as(admin).delete(`/api/orgs/${acme}/invites/${invitation.id}`)).status).toBe(403);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).revokedAt).toBeNull();
  });

  it("can't revoke an invite that's already been used", async () => {
    const { token, invitation } = await invite();
    await as(outsider).post(`/api/invites/${token}/accept`);

    expect((await as(owner).delete(`/api/orgs/${acme}/invites/${invitation.id}`)).status).toBe(404);
    expect(await roleIn(outsider, acme)).toBe("VIEWER");
  });
});
