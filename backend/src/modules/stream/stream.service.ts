import { randomUUID } from "crypto";
import { logger } from "../../config/logger";
import { auditService, failureReason } from "../audit/audit.service";
import { AuditActor, AuditDevice } from "../audit/audit.types";
import { connectedAgentFor } from "../device/agentConnection";
import { OrgDevice } from "../device/device.types";
import { broadcastStreamFrame, broadcastStreamState, findAgentSocket } from "../../realtime/socket";
import { AnnotationUpdate } from "./stream.validation";

// Live-view frame parameters sent to the agent on stream:start. Kept here
// (not hardcoded in the agent) so the viewing side owns the quality/rate
// tradeoff; the agent falls back to its own defaults if any are omitted.
const STREAM_MAX_WIDTH = 1280;
const STREAM_QUALITY = 55;
const STREAM_INTERVAL_MS = 500;

// The 36-char UUID session id the agent prefixes onto every binary frame
// (see socket_client.rs's stream_loop), so a frame can be matched to the
// session that is currently active and any late frame from a just-stopped
// session can be dropped.
const SESSION_ID_PREFIX_LENGTH = 36;

/// One dashboard tab watching a live view: its socket, and the member
/// behind it - each viewer's start and end is audited separately.
export interface Viewer {
  socketId: string;
  actor: AuditActor;
}

/// Why a viewer's live view ended, as recorded in the audit log.
export type ViewEndReason = "STOPPED" | "DASHBOARD_CLOSED" | "ACCESS_REVOKED" | "DEVICE_OFFLINE";

interface ViewerState {
  actor: AuditActor;
  joinedAt: number;
}

interface StreamState {
  /// The device as it was when the session started; its orgId is where this
  /// session's state is announced.
  device: AuditDevice;
  sessionId: string;
  /// Keyed by socket id.
  viewers: Map<string, ViewerState>;
}

// At most one live-view session per device. Several dashboard tabs (of any
// authorized members) can watch the same device's session - they all join
// that device's stream room and the agent only streams once. Sessions of
// different devices are fully independent.
const sessions = new Map<string, StreamState>();

function auditStart(device: AuditDevice, actor: AuditActor, error?: unknown): Promise<void> {
  return auditService.record({
    actor,
    device,
    action: "LIVE_VIEW_STARTED",
    outcome: error === undefined ? "SUCCESS" : "FAILURE",
    detail: error === undefined ? undefined : { error: failureReason(error) },
  });
}

function auditEnd(device: AuditDevice, viewer: ViewerState, reason: ViewEndReason): Promise<void> {
  return auditService.record({
    actor: viewer.actor,
    device,
    action: "LIVE_VIEW_ENDED",
    outcome: "SUCCESS",
    detail: { reason, durationSeconds: Math.round((Date.now() - viewer.joinedAt) / 1000) },
  });
}

export const streamService = {
  /// An authorized viewer asks to start or join a device's live view.
  /// Starts the agent stream if this is the device's first viewer;
  /// otherwise just joins the existing session. Throws if the device's
  /// agent isn't connected.
  async startViewing(device: OrgDevice, viewer: Viewer): Promise<void> {
    const existing = sessions.get(device.id);
    if (existing) {
      // A repeated start from a tab that is already watching changes nothing.
      if (existing.viewers.has(viewer.socketId)) return;
      existing.viewers.set(viewer.socketId, { actor: viewer.actor, joinedAt: Date.now() });
      await auditStart(existing.device, viewer.actor);
      return;
    }

    // Reserve the session slot synchronously, before the await below, so two
    // near-simultaneous stream:start calls for the same device can't both see
    // no session and start two competing ones. A second caller now finds this
    // reservation and just joins it. If reaching the agent fails, the
    // reservation is rolled back (only if still ours) so a failed start
    // doesn't leave the device's stream wedged "active" forever.
    const sessionId = randomUUID();
    const auditDevice = { id: device.id, orgId: device.orgId, name: device.name };
    sessions.set(device.id, {
      device: auditDevice,
      sessionId,
      viewers: new Map([[viewer.socketId, { actor: viewer.actor, joinedAt: Date.now() }]]),
    });

    try {
      const agentSocket = await connectedAgentFor(device, "start a live view");
      agentSocket.emit("stream:start", {
        sessionId,
        maxWidth: STREAM_MAX_WIDTH,
        quality: STREAM_QUALITY,
        intervalMs: STREAM_INTERVAL_MS,
      });
      broadcastStreamState(device.orgId, device.id, true, sessionId);
      logger.info(`Live view started for device ${device.id} (session ${sessionId}) by viewer ${viewer.socketId}`);
    } catch (err) {
      if (sessions.get(device.id)?.sessionId === sessionId) {
        sessions.delete(device.id);
      }
      await auditStart(auditDevice, viewer.actor, err);
      throw err;
    }
    await auditStart(auditDevice, viewer.actor);
  },

  /// Whether this socket is currently a viewer of this device's live view -
  /// the gate for per-session actions like annotations, which were already
  /// authorized when the viewer joined.
  isViewing(deviceId: string, viewerSocketId: string): boolean {
    return sessions.get(deviceId)?.viewers.has(viewerSocketId) ?? false;
  },

  /// Every live view this socket is currently watching, with the device's
  /// organization - for re-checking that it is still allowed to.
  viewedBy(viewerSocketId: string): { deviceId: string; orgId: string }[] {
    return [...sessions.entries()]
      .filter(([, session]) => session.viewers.has(viewerSocketId))
      .map(([deviceId, session]) => ({ deviceId, orgId: session.device.orgId }));
  },

  /// A viewer leaves one device's live view. When its last viewer leaves,
  /// that device's agent stream is stopped so the laptop isn't capturing
  /// frames nobody is watching.
  async stopViewing(deviceId: string, viewerSocketId: string, reason: ViewEndReason): Promise<void> {
    const session = sessions.get(deviceId);
    const viewer = session?.viewers.get(viewerSocketId);
    if (!session || !viewer) return;
    session.viewers.delete(viewerSocketId);
    const audited = auditEnd(session.device, viewer, reason);
    if (session.viewers.size > 0) {
      await audited;
      return;
    }

    sessions.delete(deviceId);
    broadcastStreamState(session.device.orgId, deviceId, false, null);

    const agentSocket = await findAgentSocket(deviceId);
    agentSocket?.emit("stream:stop", { sessionId: session.sessionId });
    logger.info(`Live view stopped for device ${deviceId} (session ${session.sessionId})`);
    await audited;
  },

  /// A dashboard socket disconnected: remove it from every live view it was
  /// watching.
  async stopViewingEverywhere(viewerSocketId: string): Promise<void> {
    const watched = [...sessions.entries()]
      .filter(([, session]) => session.viewers.has(viewerSocketId))
      .map(([deviceId]) => deviceId);
    await Promise.all(watched.map((deviceId) => streamService.stopViewing(deviceId, viewerSocketId, "DASHBOARD_CLOSED")));
  },

  /// Relays one binary frame from a device's agent to that device's viewers.
  /// The 36-byte session-id prefix is stripped and validated; a frame whose
  /// session is no longer the device's active one (a straggler after stop)
  /// is dropped rather than shown.
  handleAgentFrame(deviceId: string, framed: Buffer): void {
    const session = sessions.get(deviceId);
    if (!session) return;
    if (framed.length < SESSION_ID_PREFIX_LENGTH) {
      logger.error(`Received malformed stream:frame from device ${deviceId} (too short)`);
      return;
    }
    const sessionId = framed.toString("utf8", 0, SESSION_ID_PREFIX_LENGTH);
    if (sessionId !== session.sessionId) return;

    broadcastStreamFrame(deviceId, framed.subarray(SESSION_ID_PREFIX_LENGTH));
  },

  /// Forwards (already-validated) annotation shapes to the device agent's
  /// display-only overlay.
  async forwardAnnotation(deviceId: string, shapes: AnnotationUpdate["shapes"]): Promise<void> {
    const agentSocket = await findAgentSocket(deviceId);
    agentSocket?.emit("annotation:update", { shapes });
  },

  async clearAnnotation(deviceId: string): Promise<void> {
    const agentSocket = await findAgentSocket(deviceId);
    agentSocket?.emit("annotation:clear");
  },

  /// Called when a device's agent socket drops - its stream is dead, so its
  /// session is reset and the next viewer request starts a fresh one. Other
  /// devices' sessions are untouched.
  handleAgentDisconnected(deviceId: string): void {
    const session = sessions.get(deviceId);
    if (!session) return;
    sessions.delete(deviceId);
    broadcastStreamState(session.device.orgId, deviceId, false, null);
    logger.info(`Live view for device ${deviceId} ended because its agent disconnected (session ${session.sessionId})`);
    for (const viewer of session.viewers.values()) void auditEnd(session.device, viewer, "DEVICE_OFFLINE");
  },
};
