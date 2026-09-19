export type EventType =
  | "BOOT"
  | "SHUTDOWN"
  | "RESTART"
  | "LOCK"
  | "UNLOCK"
  | "SLEEP"
  | "WAKE"
  | "INTERNET_CONNECTED"
  | "INTERNET_DISCONNECTED"
  | "BATTERY_LOW";

export interface SentinelEvent {
  id: string;
  type: EventType;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
  device: {
    id: string;
    name: string;
  };
}

export interface PaginatedEvents {
  items: SentinelEvent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
