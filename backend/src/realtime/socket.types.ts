import { EventWithDevice } from "../modules/event/event.types";

export interface ServerToDashboardEvents {
  "event:new": (event: EventWithDevice) => void;
  "device:status": (payload: { deviceId: string; online: boolean }) => void;
}

export interface ServerToAgentEvents {
  "command:execute": (payload: { commandId: string; type: string; params?: Record<string, unknown> }) => void;
}

export interface AgentToServerEvents {
  "event:report": (
    payload: { type: string; metadata?: Record<string, unknown>; occurredAt?: string },
    ack: (result: { success: boolean; error?: string }) => void,
  ) => void;
}
