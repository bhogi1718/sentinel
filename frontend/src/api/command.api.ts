import { apiClient } from "./client";

export type CommandType = "LOCK" | "RESTART" | "SHUTDOWN" | "SLEEP" | "LOG_OFF";
export type CommandStatus = "PENDING" | "SENT" | "ACKNOWLEDGED" | "FAILED";

export interface Command {
  id: string;
  type: CommandType;
  status: CommandStatus;
  errorMessage: string | null;
  requestedAt: string;
  acknowledgedAt: string | null;
  device: {
    id: string;
    name: string;
  };
}

export const commandApi = {
  async send(type: CommandType): Promise<Command> {
    const response = await apiClient.post<{ success: true; data: Command }>("/device/commands", { type });
    return response.data.data;
  },
};
