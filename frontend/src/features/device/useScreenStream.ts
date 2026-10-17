import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceRef } from "@/api/paths";
import { useSocket } from "@/realtime/useSocket";

interface StreamStartAck {
  success: boolean;
  error?: string;
}

/// Drives one device's live screen view over the existing dashboard
/// Socket.IO connection. start() asks the backend (which authorizes the
/// request and asks that device's agent) to begin streaming; each binary frame that arrives is turned into an object URL
/// for an <img>, with the previous one revoked so memory doesn't grow one
/// blob per frame. Stops automatically on unmount so leaving the page tells
/// the agent to stop capturing.
export function useScreenStream({ orgId, deviceId }: DeviceRef) {
  const { socket, isConnected } = useSocket();
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [secondsSinceFrame, setSecondsSinceFrame] = useState(0);
  const currentUrl = useRef<string | null>(null);
  const frameTimes = useRef<number[]>([]);
  const lastFrameAt = useRef<number>(0);

  const revokeCurrent = useCallback(() => {
    if (currentUrl.current) {
      URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!socket || !isConnected) {
      setError("Not connected to the server");
      return;
    }
    setError(null);
    setIsStarting(true);
    socket.emit("stream:start", { orgId, deviceId }, (ack: StreamStartAck) => {
      setIsStarting(false);
      if (ack?.success) {
        setIsStreaming(true);
      } else {
        setError(ack?.error ?? "Failed to start live view");
        setIsStreaming(false);
      }
    });
  }, [socket, isConnected, orgId, deviceId]);

  const stop = useCallback(() => {
    socket?.emit("stream:stop", { deviceId });
    setIsStreaming(false);
    revokeCurrent();
    setFrameUrl(null);
  }, [socket, deviceId, revokeCurrent]);

  // Incoming frames + server-pushed stream state.
  useEffect(() => {
    if (!socket) return;

    const onFrame = (data: ArrayBuffer) => {
      const blob = new Blob([data], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      revokeCurrent();
      currentUrl.current = url;
      setFrameUrl(url);

      // Frame-rate estimate from the spacing of the last several frames.
      const now = performance.now();
      lastFrameAt.current = now;
      setSecondsSinceFrame(0);
      const times = frameTimes.current;
      times.push(now);
      if (times.length > 10) times.shift();
      if (times.length >= 2) {
        const span = (times[times.length - 1] - times[0]) / 1000;
        if (span > 0) setFps((times.length - 1) / span);
      }
    };

    // stream:state is announced to the whole organization; only this
    // device's state matters here. (Frames need no such check - the server
    // only sends a socket the frames of the device it is viewing.)
    const onState = (payload: { deviceId: string; active: boolean }) => {
      if (payload.deviceId !== deviceId) return;
      if (!payload.active) {
        setIsStreaming(false);
        revokeCurrent();
        setFrameUrl(null);
      }
    };

    socket.on("stream:frame", onFrame);
    socket.on("stream:state", onState);
    return () => {
      socket.off("stream:frame", onFrame);
      socket.off("stream:state", onState);
    };
  }, [socket, deviceId, revokeCurrent]);

  // Tick the "seconds since last frame" readout while streaming, so a
  // stalled feed is visible rather than looking frozen-but-live.
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      if (lastFrameAt.current > 0) {
        setSecondsSinceFrame((performance.now() - lastFrameAt.current) / 1000);
      }
    }, 500);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Leaving the page (or losing the socket) stops the agent stream and
  // frees the last frame's memory.
  useEffect(() => {
    return () => {
      socket?.emit("stream:stop", { deviceId });
      revokeCurrent();
    };
  }, [socket, deviceId, revokeCurrent]);

  // Reset stats when a stream ends.
  useEffect(() => {
    if (!isStreaming) {
      setFps(0);
      frameTimes.current = [];
    }
  }, [isStreaming]);

  return { frameUrl, isStreaming, isStarting, error, fps, secondsSinceFrame, start, stop };
}
