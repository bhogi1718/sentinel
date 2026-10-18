import type { Application } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Sign-up and creating organizations through the real HTTP stack and a real
// Postgres: what a new visitor gets, what they can reach, and the limits
// that keep a free-tier database from being filled.

let database: TestDatabase;
let prisma: PrismaClient;
let app: Application;
let maxOwned: number;

beforeAll(async () => {
  database = await startTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ prisma } = await import("../../prisma/client"));
  ({ MAX_OWNED_ORGANIZATIONS: maxOwned } = await import("../../modules/organization/organization.service"));
  app = (await import("../../app")).createApp();
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  await database.stop();
});

beforeEach(async () => {
  await database.reset();
});

const newcomer = {
  name: "Nina Patel",
  email: "Nina@Example.com",
  password: "a-long-enough-password",
  organizationName: "Patel Design",
};

function signup(body: object) {
  return request(app).post("/api/auth/signup").send(body);
}

function tokensOf(res: request.Response) {
  return (res.body as { data: { accessToken: string; refreshToken: string } }).data;
}

describe("sign-up", () => {
  it("creates the account and its organization, with the new user as Owner, and signs them in", async () => {
    const res = await signup(newcomer);
    expect(res.status).toBe(201);

    const { accessToken, refreshToken } = tokensOf(res);
    expect(refreshToken).toEqual(expect.any(String));

    const orgs = await request(app).get("/api/orgs").set("Authorization", `Bearer ${accessToken}`);
    const list = (orgs.body as { data: { name: string; slug: string; role: string; isDemo: boolean }[] }).data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Patel Design", role: "OWNER", isDemo: false });
    expect(list[0].slug).toMatch(/^patel-design-[a-z0-9]{6}$/);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.membership.count()).toBe(1);
  });

  it("stores the email in lowercase and logs in whatever its case", async () => {
    await signup(newcomer);

    expect((await prisma.user.findFirstOrThrow()).email).toBe("nina@example.com");
    for (const email of ["nina@example.com", "NINA@EXAMPLE.COM"]) {
      const login = await request(app).post("/api/auth/login").send({ email, password: newcomer.password });
      expect(login.status).toBe(200);
    }
  });

  it("names the organization after the person when no name is given", async () => {
    await signup({ name: newcomer.name, email: newcomer.email, password: newcomer.password });

    expect((await prisma.organization.findFirstOrThrow()).name).toBe("Nina Patel's organization");
  });

  it("refuses an email that's already registered, in any case, and creates nothing", async () => {
    expect((await signup(newcomer)).status).toBe(201);

    const again = await signup({ ...newcomer, email: "NINA@example.com", organizationName: "Second" });
    expect(again.status).toBe(409);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.organization.count()).toBe(1);
  });

  it("refuses an email that differs only in case from an older, mixed-case account", async () => {
    await prisma.user.create({ data: { email: "Legacy@Example.com", passwordHash: "not-used" } });

    expect((await signup({ ...newcomer, email: "legacy@example.com" })).status).toBe(409);
  });

  it("refuses the shared demo account's email", async () => {
    const res = await signup({ ...newcomer, email: "visitor@demo.sentinel.invalid" });
    expect(res.status).toBe(409);
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects short passwords and missing fields", async () => {
    expect((await signup({ ...newcomer, password: "short" })).status).toBe(400);
    expect((await signup({ ...newcomer, name: "  " })).status).toBe(400);
    expect((await signup({ ...newcomer, email: "not-an-email" })).status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("gives two organizations with the same name different slugs", async () => {
    await signup(newcomer);
    await signup({ ...newcomer, email: "other@example.com" });

    const slugs = (await prisma.organization.findMany()).map((org) => org.slug);
    expect(new Set(slugs).size).toBe(2);
  });

  it("never gives a new organization the demo's slug", async () => {
    await signup({ ...newcomer, organizationName: "Demo" });

    expect((await prisma.organization.findFirstOrThrow()).slug).not.toBe("demo");
  });
});

describe("creating another organization", () => {
  async function member() {
    const res = await signup(newcomer);
    const user = await prisma.user.findFirstOrThrow();
    return { user, auth: { Authorization: `Bearer ${tokensOf(res).accessToken}` } };
  }

  it("creates it with the caller as Owner, alongside their existing ones", async () => {
    const { auth } = await member();

    const res = await request(app).post("/api/orgs").set(auth).send({ name: "Side Project" });
    expect(res.status).toBe(201);
    expect((res.body as { data: { name: string; role: string; permissions: string[] } }).data).toMatchObject({
      name: "Side Project",
      role: "OWNER",
    });

    const orgs = await request(app).get("/api/orgs").set(auth);
    expect((orgs.body as { data: { name: string }[] }).data.map((org) => org.name)).toEqual(["Patel Design", "Side Project"]);
  });

  it("caps how many organizations one person can own", async () => {
    const { user, auth } = await member();
    for (let i = 1; i < maxOwned; i++) {
      await prisma.organization.create({
        data: { name: `Org ${i}`, slug: `org-${i}`, memberships: { create: { userId: user.id, role: "OWNER" } } },
      });
    }

    const res = await request(app).post("/api/orgs").set(auth).send({ name: "One too many" });
    expect(res.status).toBe(409);
    expect(await prisma.organization.count()).toBe(maxOwned);
  });

  it("refuses the demo account and anyone signed out", async () => {
    const demo = await prisma.user.create({
      data: { email: "visitor@demo.sentinel.invalid", passwordHash: "not-used" },
      select: { id: true, email: true },
    });

    const asDemo = await request(app)
      .post("/api/orgs")
      .set("Authorization", `Bearer ${accessTokenFor(demo)}`)
      .send({ name: "Mine" });
    expect(asDemo.status).toBe(403);
    expect((await request(app).post("/api/orgs").send({ name: "Mine" })).status).toBe(401);
    expect(await prisma.organization.count()).toBe(0);
  });

  it("rejects an empty name", async () => {
    const { auth } = await member();
    expect((await request(app).post("/api/orgs").set(auth).send({ name: "   " })).status).toBe(400);
  });
});
