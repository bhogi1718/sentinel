import { OrgRole } from "@prisma/client";
import { Namespace, Server as SocketIOServer, Socket } from "socket.io";
import { can } from "../../common/permissions";
import { logger } from "../../config/logger";
import { authService } from "../../modules/auth/auth.service";
import { AuthenticatedUser } from "../../modules/auth/auth.types";
import { organizationRepository } from "../../modules/organization/organization.repository";
import { streamService } from "../../modules/stream/stream.service";
import {
  annotationClearSchema,
  annotationUpdateSchema,
  deviceTargetSchema,
  streamStopSchema,
} from "../../modules/stream/stream.validation";
import { authorizeDeviceAction } from "../authorizeDeviceAction";
import { orgRoom, streamRoom } from "../rooms";

interface DashboardSocket extends Socket {
  user?: AuthenticatedUser;
  /// The user's role in each organization, as of the last membership check.
  roles?: Map<string, OrgRole>;
  /// When the access token this socket authenticated with expires.
  tokenExpiresAt?: Date | null;
}

type Ack = (response: { success: boolean; error?: string }) => void;

/// How often every connected dashboard's memberships are re-checked, so a
/// removed or downgraded member stops receiving an organization's data
/// within this window even without reconnecting. (Code that changes a
/// membership should also call resyncDashboardSockets(userId) to apply it
/// at once.)
const MEMBERSHIP_RESYNC_MS = 30_000;

let dashboardNamespace: Namespace | undefined;

async function loadRoles(userId: string): Promise<Map<string, OrgRole>> {
  const memberships = await organizationRepository.listMembershipsForUser(userId);
  return new Map(memberships.map((membership) => [membership.orgId, membership.role]));
}

/// Brings a socket's organization rooms and live views in line with the
/// user's current memberships: leaves the rooms of organizations they no
/// longer belong to, joins any they were added to, and ends live views their
/// role no longer allows.
async function applyRoles(socket: DashboardSocket, roles: Map<string, OrgRole>): Promise<void> {
  const previous = socket.roles ?? new Map<string, OrgRole>();
  socket.roles = roles;

  for (const orgId of previous.keys()) {
    if (!roles.has(orgId)) await socket.leave(orgRoom(orgId));
  }
  const added = [...roles.keys()].filter((orgId) => !previous.has(orgId));
  if (added.length > 0) await socket.join(added.map(orgRoom));

  for (const { deviceId, orgId } of streamService.viewedBy(socket.id)) {
    const role = roles.get(orgId);
    if (!role || !can(role, "screen:view")) {
      await socket.leave(streamRoom(deviceId));
      await streamService.stopViewing(deviceId, socket.id, "ACCESS_REVOKED");
      logger.info(`Ended live view of device ${deviceId} for ${socket.user?.email}: no longer authorized`);
    }
  }
}

/// Re-checks the memberships of every connected dashboard socket - or only
/// one user's, when a caller knows whose membership just changed. Users with
/// several open tabs are looked up once.
export async function resyncDashboardSockets(userId?: string): Promise<void> {
  if (!dashboardNamespace) return;

  const byUser = new Map<string, DashboardSocket[]>();
  for (const socket of dashboardNamespace.sockets.values() as Iterable<DashboardSocket>) {
    const id = socket.user?.id;
    if (!id || (userId && id !== userId)) continue;
    byUser.set(id, [...(byUser.get(id) ?? []), socket]);
  }

  for (const [id, sockets] of byUser) {
    try {
      const roles = await loadRoles(id);
      await Promise.all(sockets.map((socket) => applyRoles(socket, roles)));
    } catch (err) {
      logger.error(`Failed to re-check memberships for user ${id}`, { error: err instanceof Error ? err.message : err });
    }
  }
}

export function registerDashboardNamespace(io: SocketIOServer): void {
  const namespace = io.of("/dashboard");
  dashboardNamespace = namespace;

  const resyncTimer = setInterval(() => void resyncDashboardSockets(), MEMBERSHIP_RESYNC_MS);
  // Never keep the process alive just for this.
  resyncTimer.unref();

  namespace.use((socket: DashboardSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Missing access token"));
      return;
    }

    let user: AuthenticatedUser;
    try {
      user = authService.verifyAccessToken(token);
    } catch {
      next(new Error("Invalid or expired access token"));
      return;
    }

    // Memberships are resolved here, before the connection is accepted, so
    // the socket is in its organization rooms from its very first moment
    // and can't miss a broadcast sent while it was still joining. socket.io's
    // middleware type expects a void-returning function, hence the IIFE.
    void (async () => {
      try {
        socket.user = user;
        socket.roles = await loadRoles(user.id);
        socket.tokenExpiresAt = authService.accessTokenExpiresAt(token);
        next();
      } catch (err) {
        logger.error("Dashboard auth middleware failed", { error: err instanceof Error ? err.message : err });
        next(new Error("Authentication temporarily unavailable"));
      }
    })();
  });

  namespace.on("connection", (socket: DashboardSocket) => {
    const user = socket.user!;
    logger.info(`Dashboard connected: ${user.email}`);

    // One room per organization the user is a member of; every dashboard
    // broadcast targets exactly one of these. Kept current by
    // resyncDashboardSockets.
    void socket.join([...(socket.roles ?? new Map<string, OrgRole>()).keys()].map(orgRoom));

    // The socket may not outlive the token it authenticated with. When it
    // expires the server disconnects it; the dashboard then refreshes its
    // session and reconnects - which fails if the session was revoked
    // (logout, password change) in the meantime.
    let expiryTimer: NodeJS.Timeout | undefined;
    if (socket.tokenExpiresAt) {
      const remaining = Math.max(0, socket.tokenExpiresAt.getTime() - Date.now());
      expiryTimer = setTimeout(() => {
        logger.info(`Disconnecting dashboard ${user.email}: access token expired`);
        socket.disconnect(true);
      }, remaining);
    }

    // Starting (or joining) a live view is the one dashboard socket action
    // that grants access to a device's data, so it is authorized exactly
    // like the REST routes: membership, the screen:view permission, and the
    // device belonging to the organization.
    socket.on("stream:start", async (payload: unknown, ack?: Ack) => {
      const target = deviceTargetSchema.safeParse(payload);
      if (!target.success) {
        ack?.({ success: false, error: "Invalid live view request" });
        return;
      }

      try {
        const device = await authorizeDeviceAction(user, target.data, "screen:view");
        await streamService.startViewing(device, { socketId: socket.id, actor: user });
        // Only confirmed viewers get frames (see broadcastStreamFrame) - join
        // this device's room now that this socket is one.
        await socket.join(streamRoom(device.id));
        ack?.({ success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start live view";
        logger.error(`Dashboard ${user.email} failed to start live view`, { error: message, ...target.data });
        ack?.({ success: false, error: message });
      }
    });

    // Leaving only ever removes this socket's own viewership, so it needs
    // no authorization beyond knowing which device.
    socket.on("stream:stop", (payload: unknown) => {
      const parsed = streamStopSchema.safeParse(payload);
      if (!parsed.success) return;
      void socket.leave(streamRoom(parsed.data.deviceId));
      void streamService.stopViewing(parsed.data.deviceId, socket.id, "STOPPED");
    });

    // Shared annotations belong to a live view session: only a socket that
    // is currently a viewer of that device (authorized when it joined, and
    // re-checked by resyncDashboardSockets) can draw on its overlay.
    socket.on("annotation:update", (payload: unknown) => {
      const parsed = annotationUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Dashboard ${user.email} sent a malformed annotation:update`);
        return;
      }
      if (!streamService.isViewing(parsed.data.deviceId, socket.id)) return;
      void streamService.forwardAnnotation(parsed.data.deviceId, parsed.data.shapes);
    });

    socket.on("annotation:clear", (payload: unknown) => {
      const parsed = annotationClearSchema.safeParse(payload);
      if (!parsed.success) return;
      if (!streamService.isViewing(parsed.data.deviceId, socket.id)) return;
      void streamService.clearAnnotation(parsed.data.deviceId);
    });

    socket.on("disconnect", () => {
      logger.info(`Dashboard disconnected: ${user.email}`);
      clearTimeout(expiryTimer);
      // socket.io auto-removes the socket from its rooms on disconnect, so no
      // explicit leave is needed here. Any device whose last viewer this was
      // has its agent stream stopped.
      void streamService.stopViewingEverywhere(socket.id);
    });
  });
}
