import { CommandType, CommandStatus } from "@prisma/client";

export { CommandType, CommandStatus };

export interface CommandWithDevice {
  id: string;
  type: CommandType;
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
