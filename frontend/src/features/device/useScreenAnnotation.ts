import { useCallback } from "react";
import { useSocket } from "@/realtime/useSocket";

export interface WirePoint {
  x: number;
  y: number;
}

export interface WireShape {
  tool: string;
  color: string;
  width: number;
  points: WirePoint[];
}

/// Pushes annotation shapes to one device's on-screen overlay over the
/// dashboard socket (backend relays to that device's agent, which relays to
/// the display-only helper overlay). Coordinates are already normalized
/// 0..1 over the screen by the caller. The backend only accepts these from
/// a socket that is currently watching that device's live view.
export function useScreenAnnotation(deviceId: string) {
  const { socket } = useSocket();

  const broadcast = useCallback(
    (shapes: WireShape[]) => {
      socket?.emit("annotation:update", { deviceId, shapes });
    },
    [socket, deviceId],
  );

  const clear = useCallback(() => {
    socket?.emit("annotation:clear", { deviceId });
  }, [socket, deviceId]);

  return { broadcast, clear };
}
