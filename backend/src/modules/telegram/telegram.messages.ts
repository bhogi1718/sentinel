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

// Telegram's HTML parse_mode only treats &, <, > as special (unlike full
// HTML, quotes don't need escaping in text content), but escaping & first
// is essential - otherwise escaping < and > afterwards would double-escape
// any literal "&lt;" the device name happened to contain.
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatEventMessage(deviceName: string, type: EventType, occurredAt: Date, metadata?: unknown): string {
  const { emoji, label } = EVENT_LABELS[type];
  let message = `${emoji} <b>${escapeTelegramHtml(deviceName)}</b> ${label}`;

  if (type === "BATTERY_LOW" && metadata && typeof metadata === "object" && "batteryPercent" in metadata) {
    message += ` (${(metadata as { batteryPercent: number }).batteryPercent}%)`;
  }

  message += `\n<i>${occurredAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  })}</i>`;

  return message;
}
