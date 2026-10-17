import { apiClient } from "./client";
import { devicePath, type DeviceRef } from "./paths";

export type CommandType = "LOCK" | "RESTART" | "SHUTDOWN" | "SLEEP" | "LOG_OFF" | "KILL_PROCESS";
export type CommandStatus = "PENDING" | "SENT" | "ACKNOWLEDGED" | "FAILED";

export interface Command {
  id: string;
  orgId: string;
  deviceId: string;
  type: CommandType;
  targetPid: number | null;
  targetName: string | null;
  status: CommandStatus;
  errorMessage: string | null;
  requestedAt: string;
  acknowledgedAt: string | null;
  device: {
    id: string;
    name: string;
  };
  /// Null for commands recorded before requesters were tracked, or whose
  /// requester has since been removed.
  requestedBy: { id: string; email: string; name: string | null } | null;
}

export interface PaginatedCommands {
  items: Command[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

// KILL_PROCESS is the only command type carrying a payload (see
// command.validation.ts on the backend) - a discriminated union here keeps
// pid/name required exactly when they're needed instead of leaving them as
// always-optional fields every other command type could pass by mistake.
export type SendCommandInput =
  | { type: Exclude<CommandType, "KILL_PROCESS"> }
  | { type: "KILL_PROCESS"; pid: number; name: string };

export const commandApi = {
  async send(ref: DeviceRef, input: SendCommandInput): Promise<Command> {
    const response = await apiClient.post<{ success: true; data: Command }>(`${devicePath(ref)}/commands`, input);
    return response.data.data;
  },

  async list(ref: DeviceRef, params: { page?: number; pageSize?: number } = {}): Promise<PaginatedCommands> {
    const response = await apiClient.get<{ success: true; data: PaginatedCommands }>(`${devicePath(ref)}/commands`, {
      params,
    });
    return response.data.data;
  },
};
