import { createContext } from "react";
import { Socket } from "socket.io-client";

export interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });
