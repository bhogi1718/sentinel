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

/// Pushes annotation shapes to the laptop's on-screen overlay over the
/// dashboard socket (backend relays to the agent, which relays to the
/// display-only helper overlay). Coordinates are already normalized 0..1
/// over the screen by the caller.
export function useScreenAnnotation() {
  const { socket } = useSocket();

  const broadcast = useCallback(
    (shapes: WireShape[]) => {
      socket?.emit("annotation:update", { shapes });
    },
    [socket],
  );

  const clear = useCallback(() => {
    socket?.emit("annotation:clear");
  }, [socket]);

  return { broadcast, clear };
}
