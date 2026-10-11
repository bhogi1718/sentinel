import { randomUUID } from "crypto";
import { logger } from "../../config/logger";
import { deviceRepository } from "../device/device.repository";
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

interface StreamState {
  sessionId: string;
  viewers: Set<string>;
}

// At most one live-view session exists at a time (single-owner, one
// laptop). Multiple dashboard tabs can watch the same session - they all
// receive the same broadcast frames, and the agent only streams once.
let state: StreamState | null = null;

export const streamService = {
  /// A dashboard viewer asks to start/join the live view. Starts the agent
  /// stream if this is the first viewer; otherwise just joins the existing
  /// one. Throws if no device is registered/online/connected.
  async startViewing(viewerSocketId: string): Promise<void> {
    if (state) {
      state.viewers.add(viewerSocketId);
      return;
    }

    // Reserve the session slot synchronously, before the awaits below, so two
    // near-simultaneous stream:start calls can't both pass the `state === null`
    // check across an await and start two competing sessions. Any second
    // caller now sees this reserved state and just joins it. If the async
    // lookups fail, the reservation is rolled back (only if still ours) so a
    // failed start doesn't leave the stream wedged "active" forever.
    const sessionId = randomUUID();
    state = { sessionId, viewers: new Set([viewerSocketId]) };

    try {
      const device = await deviceRepository.findFirst();
      if (!device) {
        throw new Error("No device has been registered yet");
      }
      if (!device.isOnline) {
        throw new Error("Device is offline - cannot start a live view");
      }

      const agentSocket = await findAgentSocket(device.id);
      if (!agentSocket) {
        throw new Error("Device is not currently connected");
      }

      agentSocket.emit("stream:start", {
        sessionId,
        maxWidth: STREAM_MAX_WIDTH,
        quality: STREAM_QUALITY,
        intervalMs: STREAM_INTERVAL_MS,
      });
      broadcastStreamState(true, sessionId);
      logger.info(`Live view started (session ${sessionId}) by viewer ${viewerSocketId}`);
    } catch (err) {
      if (state?.sessionId === sessionId) {
        state = null;
      }
      throw err;
    }
  },

  /// A viewer leaves the live view (explicit stop or disconnect). When the
  /// last viewer leaves, the agent stream is stopped so the laptop isn't
  /// capturing frames nobody is watching.
  async stopViewing(viewerSocketId: string): Promise<void> {
    if (!state) return;
    state.viewers.delete(viewerSocketId);
    if (state.viewers.size > 0) return;

    const stoppedSessionId = state.sessionId;
    state = null;
    broadcastStreamState(false, null);

    const device = await deviceRepository.findFirst();
    if (device) {
      const agentSocket = await findAgentSocket(device.id);
      agentSocket?.emit("stream:stop", { sessionId: stoppedSessionId });
    }
    logger.info(`Live view stopped (session ${stoppedSessionId})`);
  },

  /// Relays one binary frame from the agent to all dashboard viewers. The
  /// 36-byte session-id prefix is stripped and validated; a frame whose
  /// session is no longer the active one (a straggler after stop) is
  /// dropped rather than shown.
  handleAgentFrame(framed: Buffer): void {
    if (!state) return;
    if (framed.length < SESSION_ID_PREFIX_LENGTH) {
      logger.error("Received malformed stream:frame from agent (too short)");
      return;
    }
    const sessionId = framed.toString("utf8", 0, SESSION_ID_PREFIX_LENGTH);
    if (sessionId !== state.sessionId) return;

    const jpeg = framed.subarray(SESSION_ID_PREFIX_LENGTH);
    broadcastStreamFrame(jpeg);
  },

  /// Forwards (already-validated) annotation shapes to the agent's display-only
  /// overlay. We only confirm there is a connected agent to send to.
  async forwardAnnotation(update: AnnotationUpdate): Promise<void> {
    const device = await deviceRepository.findFirst();
    if (!device) return;
    const agentSocket = await findAgentSocket(device.id);
    agentSocket?.emit("annotation:update", update);
  },

  async clearAnnotation(): Promise<void> {
    const device = await deviceRepository.findFirst();
    if (!device) return;
    const agentSocket = await findAgentSocket(device.id);
    agentSocket?.emit("annotation:clear");
  },

  /// Called when the agent socket drops - the stream is dead, reset state so
  /// the next viewer request starts a fresh session.
  handleAgentDisconnected(): void {
    if (!state) return;
    const sessionId = state.sessionId;
    state = null;
    broadcastStreamState(false, null);
    logger.info(`Live view ended because the agent disconnected (session ${sessionId})`);
  },
};
