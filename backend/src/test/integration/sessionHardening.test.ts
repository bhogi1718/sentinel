import type { PrismaClient } from "@prisma/client";
import type { Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import bcrypt from "bcrypt";
import request from "supertest";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessTokenFor } from "../authTokens";
import { startTestDatabase, TestDatabase } from "../database/testDatabase";

// Session hardening on a real database and a real listening server:
// refresh tokens are single-use within a sign-in, copying one is detected
// and the whole sign-in is ended, and a session that ends closes the
// user's open dashboard connections straight away.

let database: TestDatabase;
let prisma: PrismaClient;
let server: HttpServer;
let baseUrl: string;
let app: import("express").Application;

const PASSWORD = "current-password-123";
const sockets: ClientSocket[] = [];
let ada: { id: string; email: string };
let acme: string;

beforeAll(async () => {
  database = await startTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ prisma } = await import("../../prisma/client"));
  const { createApp } = await import("../../app");
  const { initSocketServer } = await import("../../realtime/socket");
  const { createServer } = await import("http");
  app = createApp();
  server = createServer(app);
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  await database.stop();
});

beforeEach(async () => {
  await database.reset();
  ada = await prisma.user.create({
    data: { email: "ada@example.com", passwordHash: await bcrypt.hash(PASSWORD, 4) },
    select: { id: true, email: true },
  });
  acme = (await prisma.organization.create({ data: { name: "Acme", slug: "acme" } })).id;
  await prisma.membership.create({ data: { userId: ada.id, orgId: acme, role: "OWNER" } });
});

async function login(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email: ada.email, password: PASSWORD });
  expect(res.status).toBe(200);
  return (res.body as { data: { refreshToken: string } }).data.refreshToken;
}

function refresh(token: string) {
  return request(app).post("/api/auth/refresh").send({ refreshToken: token });
}

async function dashboard(): Promise<ClientSocket> {
  const socket = connect(`${baseUrl}/dashboard`, {
    auth: { token: accessTokenFor(ada) },
    transports: ["websocket"],
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

function closedWithin(socket: ClientSocket, ms: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve("already closed");
    const timer = setTimeout(() => resolve(null), ms);
    socket.once("disconnect", (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
}

describe("refresh-token reuse", () => {
  it("rotates a token once: the new one works, the old one is refused", async () => {
    const first = await login();
    const rotated = await refresh(first);
    expect(rotated.status).toBe(200);

    expect((await refresh(first)).status).toBe(401);
  });

  it("ends the whole sign-in when a rotated token is presented again", async () => {
    const first = await login();
    const second = (await refresh(first)).body as { data: { refreshToken: string } };

    // Someone holding a copy of `first` uses it after the browser rotated it.
    expect((await refresh(first)).status).toBe(401);

    // The browser's current token from that sign-in is revoked too.
    expect((await refresh(second.data.refreshToken)).status).toBe(401);
  });

  it("leaves other sign-ins of the same person untouched", async () => {
    const laptop = await login();
    const phone = await login();
    await refresh(laptop);
    await refresh(laptop); // reuse on the laptop's sign-in

    const phoneRefresh = await refresh(phone);
    expect(phoneRefresh.status).toBe(200);
  });

  it("doesn't treat a logged-out token as reuse - the other sign-ins keep working", async () => {
    const laptop = await login();
    const phone = await login();
    await request(app).post("/api/auth/logout").send({ refreshToken: laptop });

    expect((await refresh(laptop)).status).toBe(401);
    expect((await refresh(phone)).status).toBe(200);
  });

  it("closes the person's open consoles when reuse is detected", async () => {
    const socket = await dashboard();
    const first = await login();
    await refresh(first);

    await refresh(first);

    expect(await closedWithin(socket, 2_000)).toEqual(expect.any(String));
    expect(socket.connected).toBe(false);
  });

  it("keeps working for ordinary refreshes", async () => {
    let token = await login();
    for (let i = 0; i < 3; i++) {
      const res = await refresh(token);
      expect(res.status).toBe(200);
      token = (res.body as { data: { refreshToken: string } }).data.refreshToken;
    }
  });
});

describe("closing consoles when a session ends", () => {
  it("closes open dashboard connections on password change", async () => {
    const socket = await dashboard();
    const token = await login();

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${accessTokenFor(ada)}`)
      .send({ currentPassword: PASSWORD, newPassword: "a-brand-new-password" });
    expect(res.status).toBe(200);

    expect(await closedWithin(socket, 2_000)).toEqual(expect.any(String));
    expect((await refresh(token)).status).toBe(401);
  });

  it("leaves consoles of other people alone", async () => {
    const bob = await prisma.user.create({ data: { email: "bob@example.com", passwordHash: "not-used" }, select: { id: true, email: true } });
    await prisma.membership.create({ data: { userId: bob.id, orgId: acme, role: "VIEWER" } });
    const bobSocket = connect(`${baseUrl}/dashboard`, {
      auth: { token: accessTokenFor(bob) },
      transports: ["websocket"],
      forceNew: true,
    });
    sockets.push(bobSocket);
    await new Promise<void>((resolve) => bobSocket.once("connect", () => resolve()));

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${accessTokenFor(ada)}`)
      .send({ currentPassword: PASSWORD, newPassword: "a-brand-new-password" });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bobSocket.connected).toBe(true);
  });
});
