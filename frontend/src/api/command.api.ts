import { apiClient } from "./client";

export type CommandType = "LOCK" | "RESTART" | "SHUTDOWN" | "SLEEP" | "LOG_OFF" | "KILL_PROCESS";
export type CommandStatus = "PENDING" | "SENT" | "ACKNOWLEDGED" | "FAILED";

export interface Command {
  id: string;
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
}

// KILL_PROCESS is the only command type carrying a payload (see
// command.validation.ts on the backend) - a discriminated union here keeps
// pid/name required exactly when they're needed instead of leaving them as
// always-optional fields every other command type could pass by mistake.
export type SendCommandInput =
  | { type: Exclude<CommandType, "KILL_PROCESS"> }
  | { type: "KILL_PROCESS"; pid: number; name: string };

export const commandApi = {
  async send(input: SendCommandInput): Promise<Command> {
    const response = await apiClient.post<{ success: true; data: Command }>("/device/commands", input);
    return response.data.data;
  },
};
