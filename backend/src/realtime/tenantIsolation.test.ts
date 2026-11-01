import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { Server as SocketIOServer } from "socket.io";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A real Socket.IO server with real clients: dashboards of two
// organizations and the agents of one device in each. Only the database is
// mocked, so the rooms, middleware and handlers under test are the ones
// production runs.

vi.mock("../modules/organization/organization.repository", () => ({
  organizationRepository: { listMembershipsForUser: vi.fn(), findMembership: vi.fn() },
}));
vi.mock("../modules/device/device.repository", () => ({
  deviceRepository: {
    findByTokenHash: vi.fn(),
    setOnlineStatus: vi.fn(),
    updateLastSeen: vi.fn(),
    findInOrg: vi.fn(),
  },
}));
vi.mock("../modules/audit/audit.repository", () => ({
  auditRepository: { create: vi.fn() },
}));

import { deviceRepository } from "../modules/device/device.repository";
import { deviceService } from "../modules/device/device.service";
import { OrgDevice } from "../modules/device/device.types";
import { metricsService } from "../modules/metrics/metrics.service";
import { organizationRepository } from "../modules/organization/organization.repository";
import { accessTokenFor } from "../test/authTokens";
import { resyncDashboardSockets } from "./namespaces/dashboardNamespace";
import {
  broadcastCommandUpdate,
  broadcastEventToDashboards,
  broadcastStreamFrame,
  broadcastStreamState,
  findAgentSocket,
  initSocketServer,
} from "./socket";

const mockedOrgRepo = vi.mocked(organizationRepository, true);
const mockedDeviceRepo = vi.mocked(deviceRepository, true);

const ORG_A = "org-a";
const ORG_B = "org-b";
const ALICE = { id: "user-alice", email: "alice@a.example" }; // member of A
const BOB = { id: "user-bob", email: "bob@b.example" }; // member of B
const CAROL = { id: "user-carol", email: "carol@ab.example" }; // member of both

type Role = "VIEWER" | "ADMIN" | "OWNER";

/// Who belongs where, rebuilt before each test - tests that revoke or grant
/// access edit it mid-test, the way a real membership change would.
let memberships: Record<string, { orgId: string; role: Role }[]>;

function defaultMemberships() {
  return {
    [ALICE.id]: [{ orgId: ORG_A, role: "ADMIN" as Role }],
    [BOB.id]: [{ orgId: ORG_B, role: "OWNER" as Role }],
    [CAROL.id]: [
      { orgId: ORG_A, role: "ADMIN" as Role },
      { orgId: ORG_B, role: "ADMIN" as Role },
    ],
  };
}

function orgDevice(id: string, orgId: string): OrgDevice {
  return { id, orgId, name: id, isOnline: true, lastSeenAt: null, createdAt: new Date() };
}
const DEVICE_A = orgDevice("device-a", ORG_A);
const DEVICE_B = orgDevice("device-b", ORG_B);
const AGENT_TOKENS: Record<string, OrgDevice> = { "token-a": DEVICE_A, "token-b": DEVICE_B };

let httpServer: HttpServer;
let io: SocketIOServer;
let url: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  io = initSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await io.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  memberships = defaultMemberships();
  mockedOrgRepo.listMembershipsForUser.mockImplementation((userId: string) =>
    Promise.resolve((memberships[userId] ?? []) as never),
  );
  mockedOrgRepo.findMembership.mockImplementation((userId: string, orgId: string) => {
    const membership = memberships[userId]?.find((m) => m.orgId === orgId);
    return Promise.resolve((membership ? { ...membership, org: { id: orgId, isDemo: false } } : null) as never);
  });
  mockedDeviceRepo.findInOrg.mockImplementation((orgId: string, deviceId: string) =>
    Promise.resolve([DEVICE_A, DEVICE_B].find((d) => d.id === deviceId && d.orgId === orgId) ?? null),
  );
  mockedDeviceRepo.findByTokenHash.mockImplementation((hash: string) => {
    const entry = Object.entries(AGENT_TOKENS).find(([token]) => deviceService.hashToken(token) === hash);
    return (entry ? { ...entry[1], tokenHash: hash } : null) as never;
  });
  mockedDeviceRepo.setOnlineStatus.mockResolvedValue({} as never);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

/// A connected client that records every event it receives, by name.
async function client(namespace: "/dashboard" | "/agent", token: string) {
  const socket = connect(`${url}${namespace}`, { auth: { token }, transports: ["websocket"], forceNew: true });
  clients.push(socket);
  const received: Record<string, unknown[]> = {};
  socket.onAny((event: string, ...args: unknown[]) => {
    (received[event] ??= []).push(args[0]);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return { socket, received };
}

const dashboard = (user: { id: string; email: string }, tokenLifetimeSeconds?: number) =>
  client("/dashboard", accessTokenFor(user, tokenLifetimeSeconds));
const agent = (token: string) => client("/agent", token);

/// Lets in-flight messages arrive before asserting that something did NOT.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("dashboard broadcasts stay inside their organization", () => {
  it("delivers a new event only to members of the event's organization", async () => {
    const alice = await dashboard(ALICE);
    const bob = await dashboard(BOB);
    const carol = await dashboard(CAROL);

    broadcastEventToDashboards({
      id: "event-1",
      orgId: ORG_A,
      deviceId: DEVICE_A.id,
      type: "LOCK",
      metadata: null,
      occurredAt: new Date(),
      createdAt: new Date(),
      device: { id: DEVICE_A.id, name: DEVICE_A.name },
    });
    await settle();

    expect(alice.received["event:new"]).toHaveLength(1);
    expect(carol.received["event:new"]).toHaveLength(1);
    expect(bob.received["event:new"]).toBeUndefined();
  });

  it("delivers command updates only to the command's organization", async () => {
    const alice = await dashboard(ALICE);
    const bob = await dashboard(BOB);

    broadcastCommandUpdate({ id: "cmd-1", orgId: ORG_B, deviceId: DEVICE_B.id, status: "SENT" });
    await settle();

    expect(bob.received["command:update"]).toEqual([
      { id: "cmd-1", orgId: ORG_B, deviceId: DEVICE_B.id, status: "SENT" },
    ]);
    expect(alice.received["command:update"]).toBeUndefined();
  });

  it("delivers live-view state only to the device's organization", async () => {
    const alice = await dashboard(ALICE);
    const bob = await dashboard(BOB);

    broadcastStreamState(ORG_A, DEVICE_A.id, true, "session-1");
    await settle();

    expect(alice.received["stream:state"]).toEqual([{ deviceId: DEVICE_A.id, active: true, sessionId: "session-1" }]);
    expect(bob.received["stream:state"]).toBeUndefined();
  });

  it("announces an agent coming online only to its device's organization", async () => {
    const alice = await dashboard(ALICE);
    const bob = await dashboard(BOB);

    await agent("token-b");
    await settle();

    expect(bob.received["device:status"]).toEqual([{ deviceId: DEVICE_B.id, online: true }]);
    expect(alice.received["device:status"]).toBeUndefined();
  });

  it("puts a user who belongs to no organization in no rooms", async () => {
    const stranger = await dashboard({ id: "user-nobody", email: "nobody@example.com" });

    broadcastCommandUpdate({ id: "cmd-1", orgId: ORG_A });
    broadcastCommandUpdate({ id: "cmd-2", orgId: ORG_B });
    await settle();

    expect(stranger.received).toEqual({});
  });
});

describe("agents are addressed through their device room", () => {
  it("finds each device's own agent socket, and none for an unknown device", async () => {
    const agentA = await agent("token-a");
    const agentB = await agent("token-b");

    const foundA = await findAgentSocket(DEVICE_A.id);
    const foundB = await findAgentSocket(DEVICE_B.id);

    expect(foundA?.id).toBe(agentA.socket.id);
    expect(foundB?.id).toBe(agentB.socket.id);
    expect(await findAgentSocket("device-unknown")).toBeUndefined();
  });

  it("refuses an agent with an unknown token", async () => {
    await expect(agent("token-forged")).rejects.toThrow("Invalid device token");
  });
});

describe("agent replies only count for the device that was asked", () => {
  it("ignores another device's agent answering a request, and accepts the real one", async () => {
    const agentA = await agent("token-a");
    const agentB = await agent("token-b");

    const metricsPromise = metricsService.getMetrics(DEVICE_A);
    await vi.waitFor(() => expect(agentA.received["metrics:request"]).toHaveLength(1));
    const { requestId } = agentA.received["metrics:request"][0] as { requestId: string };
    expect(agentB.received["metrics:request"]).toBeUndefined();

    // Agent B learns A's request id and answers it with well-formed but fake
    // data - a reply that would pass validation, so only the device check
    // can stop it.
    agentB.socket.emit("metrics:response", { requestId, metrics: metrics(99) });
    await settle();

    agentA.socket.emit("metrics:response", { requestId, metrics: metrics(12) });

    await expect(metricsPromise).resolves.toEqual(metrics(12));
  });
});

describe("access is re-checked while connected", () => {
  it("stops delivering an organization's updates once the member is removed from it", async () => {
    const carol = await dashboard(CAROL);

    memberships[CAROL.id] = [{ orgId: ORG_A, role: "ADMIN" }];
    await resyncDashboardSockets(CAROL.id);

    broadcastCommandUpdate({ id: "cmd-b", orgId: ORG_B });
    broadcastCommandUpdate({ id: "cmd-a", orgId: ORG_A });
    await settle();

    expect(carol.received["command:update"]).toEqual([{ id: "cmd-a", orgId: ORG_A }]);
  });

  it("starts delivering an organization's updates once the user is added to it", async () => {
    const alice = await dashboard(ALICE);

    memberships[ALICE.id].push({ orgId: ORG_B, role: "VIEWER" });
    await resyncDashboardSockets();

    broadcastCommandUpdate({ id: "cmd-b", orgId: ORG_B });
    await settle();

    expect(alice.received["command:update"]).toEqual([{ id: "cmd-b", orgId: ORG_B }]);
  });

  it("ends a live view, and its frames, when the viewer loses permission to watch", async () => {
    const agentA = await agent("token-a");
    const alice = await dashboard(ALICE);

    const ack = (await alice.socket.emitWithAck("stream:start", { orgId: ORG_A, deviceId: DEVICE_A.id })) as {
      success: boolean;
    };
    expect(ack.success).toBe(true);
    broadcastStreamFrame(DEVICE_A.id, Buffer.from("frame-1"));
    await settle();
    expect(alice.received["stream:frame"]).toHaveLength(1);

    // Downgraded to a role that can't view screens.
    memberships[ALICE.id] = [{ orgId: ORG_A, role: "VIEWER" }];
    await resyncDashboardSockets(ALICE.id);

    broadcastStreamFrame(DEVICE_A.id, Buffer.from("frame-2"));
    await settle();

    expect(alice.received["stream:frame"]).toHaveLength(1);
    expect(agentA.received["stream:stop"]).toHaveLength(1);
  });

  it("disconnects a dashboard when its access token expires", async () => {
    // JWT expiry is whole seconds from a floored issue time, so a 1-second
    // token can already be expired at the handshake. 2 seconds always leaves
    // at least one to connect in.
    const shortLived = await dashboard(ALICE, 2);

    const reason = await new Promise<string>((resolve) => shortLived.socket.once("disconnect", resolve));

    expect(reason).toBe("io server disconnect");
  });
});

function metrics(cpuPercent: number) {
  return {
    cpuPercent,
    memoryUsedBytes: 1,
    memoryTotalBytes: 2,
    diskUsedBytes: 1,
    diskTotalBytes: 2,
    batteryPercent: null,
    networkDownloadBytesPerSec: 0,
    networkUploadBytesPerSec: 0,
    networkTotalReceivedBytes: 0,
    networkTotalTransmittedBytes: 0,
    pingMs: null,
  };
}
