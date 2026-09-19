import { CommandType, CommandStatus } from "@prisma/client";

export { CommandType, CommandStatus };

export interface CommandWithDevice {
  id: string;
  type: CommandType;
  targetPid: number | null;
  targetName: string | null;
  status: CommandStatus;
  errorMessage: string | null;
  requestedAt: Date;
  acknowledgedAt: Date | null;
  device: {
    id: string;
    name: string;
  };
}

export interface CommandAckResult {
  success: boolean;
  error?: string;
}
