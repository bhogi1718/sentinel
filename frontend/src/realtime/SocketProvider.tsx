import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { getAccessToken } from "@/api/client";
import { useAuth } from "@/features/auth/useAuth";
import type { PaginatedEvents, SentinelEvent } from "@/types/event";
import { SocketContext } from "./SocketContext";

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const accessToken = getAccessToken();
    const dashboardSocket = io("/dashboard", {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    dashboardSocket.on("connect", () => setIsConnected(true));
    dashboardSocket.on("disconnect", () => setIsConnected(false));

    dashboardSocket.on("event:new", (event: SentinelEvent) => {
      queryClient.setQueryData<PaginatedEvents>(["events", { page: 1 }], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: [event, ...current.items].slice(0, current.pagination.pageSize),
          pagination: { ...current.pagination, total: current.pagination.total + 1 },
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    });

    dashboardSocket.on("device:status", (payload: { deviceId: string; online: boolean }) => {
      queryClient.setQueryData(["device", "status", payload.deviceId], payload);
    });

    setSocket(dashboardSocket);

    return () => {
      dashboardSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated, queryClient]);

  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
}
