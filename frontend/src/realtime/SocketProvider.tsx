import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { authApi } from "@/api/auth.api";
import { getAccessToken } from "@/api/client";
import type { Command } from "@/api/command.api";
import type { Device } from "@/api/device.api";
import { queryKeys } from "@/api/queryKeys";
import { useAuth } from "@/features/auth/useAuth";
import { SOCKET_BASE_URL } from "@/lib/apiConfig";
import type { SentinelEvent } from "@/types/event";
import { SocketContext } from "./SocketContext";

/// One dashboard socket per signed-in tab. The server puts it in a room for
/// each organization the user belongs to, so it only ever receives that
/// user's organizations' updates; the handlers below patch exactly the
/// cache entries each update belongs to.
export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // `auth` as a callback (not a static object) is re-invoked on every
    // connection attempt, including automatic reconnects. The access token
    // lives ~15 min and is rotated by the axios layer; capturing it once here
    // would mean any reconnect after it expired re-handshakes with a stale
    // token and gets rejected, silently killing the realtime feed until a
    // page reload. Reading it fresh per attempt keeps reconnects authenticated.
    const dashboardSocket = io(`${SOCKET_BASE_URL}/dashboard`, {
      auth: (cb) => cb({ token: getAccessToken() ?? "" }),
      transports: ["websocket"],
    });

    // The server closes the socket when the access token it was opened with
    // expires (and refuses a reconnect with an expired one). Neither case is
    // retried automatically by socket.io, so: make one authenticated request
    // - the axios layer refreshes the access token on its 401 - then
    // reconnect, which picks up the fresh token. If the session itself was
    // revoked, that request signs the user out instead and this provider
    // unmounts the socket. Bounded so a persistent failure can't spin.
    let active = true;
    let reauthAttempts = 0;
    const MAX_REAUTH_ATTEMPTS = 3;
    const reauthenticateAndReconnect = async () => {
      if (reauthAttempts >= MAX_REAUTH_ATTEMPTS) return;
      reauthAttempts++;
      try {
        await authApi.me();
      } catch {
        return;
      }
      if (active) dashboardSocket.connect();
    };

    dashboardSocket.on("connect", () => {
      reauthAttempts = 0;
      setIsConnected(true);
    });
    dashboardSocket.on("disconnect", (reason) => {
      setIsConnected(false);
      if (reason === "io server disconnect") void reauthenticateAndReconnect();
    });
    dashboardSocket.on("connect_error", (err) => {
      if (err.message === "Invalid or expired access token") void reauthenticateAndReconnect();
    });

    // Every event list of the event's organization (any page, any filter)
    // may now be out of date.
    dashboardSocket.on("event:new", (event: SentinelEvent) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.events(event.orgId) });
    });

    dashboardSocket.on("device:status", (payload: { deviceId: string; online: boolean }) => {
      const patch = (device: Device): Device =>
        device.id === payload.deviceId
          ? { ...device, isOnline: payload.online, lastSeenAt: new Date().toISOString() }
          : device;

      queryClient.setQueryData<Device>(queryKeys.device(payload.deviceId), (current) => (current ? patch(current) : current));
      queryClient.setQueriesData<Device[]>({ queryKey: ["devices"] }, (list) => list?.map(patch));
    });

    // Someone removed a device: drop it from every list, and refetch its own
    // query so a console open on its page shows "Device not found".
    dashboardSocket.on("device:removed", (payload: { deviceId: string }) => {
      queryClient.setQueriesData<Device[]>({ queryKey: ["devices"] }, (list) => list?.filter((device) => device.id !== payload.deviceId));
      void queryClient.invalidateQueries({ queryKey: queryKeys.device(payload.deviceId) });
    });

    dashboardSocket.on("command:update", (command: Command) => {
      queryClient.setQueryData<Command>(queryKeys.command(command.id), command);
      void queryClient.invalidateQueries({ queryKey: queryKeys.commands(command.deviceId) });
    });

    setSocket(dashboardSocket);

    return () => {
      active = false;
      dashboardSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated, queryClient]);

  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
}
