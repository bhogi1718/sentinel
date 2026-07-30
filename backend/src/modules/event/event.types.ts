import { EventType } from "@prisma/client";

export { EventType };

export interface ReportedEvent {
  type: EventType;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export interface EventWithDevice {
  id: string;
  type: EventType;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
  device: {
    id: string;
    name: string;
  };
}
