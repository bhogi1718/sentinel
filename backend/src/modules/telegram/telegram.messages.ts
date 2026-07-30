import { EventType } from "@prisma/client";

const EVENT_LABELS: Record<EventType, { emoji: string; label: string }> = {
  BOOT: { emoji: "🟢", label: "booted up" },
  SHUTDOWN: { emoji: "🔴", label: "shutting down" },
  RESTART: { emoji: "🔄", label: "restarting" },
  LOCK: { emoji: "🔒", label: "locked" },
  UNLOCK: { emoji: "🔓", label: "unlocked" },
  SLEEP: { emoji: "😴", label: "went to sleep" },
  WAKE: { emoji: "☀️", label: "woke up" },
  INTERNET_CONNECTED: { emoji: "📶", label: "connected to the internet" },
  INTERNET_DISCONNECTED: { emoji: "📵", label: "lost internet connection" },
  BATTERY_LOW: { emoji: "🔋", label: "battery is low" },
};

export function formatEventMessage(deviceName: string, type: EventType, metadata?: unknown): string {
  const { emoji, label } = EVENT_LABELS[type];
  let message = `${emoji} <b>${deviceName}</b> ${label}`;

  if (type === "BATTERY_LOW" && metadata && typeof metadata === "object" && "batteryPercent" in metadata) {
    message += ` (${(metadata as { batteryPercent: number }).batteryPercent}%)`;
  }

  return message;
}
