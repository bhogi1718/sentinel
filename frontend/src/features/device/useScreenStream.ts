import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "@/realtime/useSocket";

interface StreamStartAck {
  success: boolean;
  error?: string;
}

/// Drives the live screen view over the existing dashboard Socket.IO
/// connection. start() asks the backend (which asks the agent) to begin
/// streaming; each binary frame that arrives is turned into an object URL
/// for an <img>, with the previous one revoked so memory doesn't grow one
/// blob per frame. Stops automatically on unmount so leaving the page tells
/// the agent to stop capturing.
export function useScreenStream() {
  const { socket, isConnected } = useSocket();
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUrl = useRef<string | null>(null);

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
    socket.emit("stream:start", {}, (ack: StreamStartAck) => {
      setIsStarting(false);
      if (ack?.success) {
        setIsStreaming(true);
      } else {
        setError(ack?.error ?? "Failed to start live view");
        setIsStreaming(false);
      }
    });
  }, [socket, isConnected]);

  const stop = useCallback(() => {
    socket?.emit("stream:stop");
    setIsStreaming(false);
    revokeCurrent();
    setFrameUrl(null);
  }, [socket, revokeCurrent]);

  // Incoming frames + server-pushed stream state.
  useEffect(() => {
    if (!socket) return;

    const onFrame = (data: ArrayBuffer) => {
      const blob = new Blob([data], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      revokeCurrent();
      currentUrl.current = url;
      setFrameUrl(url);
    };

    const onState = (payload: { active: boolean }) => {
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
  }, [socket, revokeCurrent]);

  // Leaving the page (or losing the socket) stops the agent stream and
  // frees the last frame's memory.
  useEffect(() => {
    return () => {
      socket?.emit("stream:stop");
      revokeCurrent();
    };
  }, [socket, revokeCurrent]);

  return { frameUrl, isStreaming, isStarting, error, start, stop };
}
