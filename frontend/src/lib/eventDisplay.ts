import type { IconName } from "@/components/ui/Icon";
import type { EventType } from "@/types/event";

type Tone = "primary" | "success" | "warning" | "error" | "neutral";

interface EventDisplayMeta {
  label: string;
  code: string;
  icon: IconName;
  filled: boolean;
  tone: Tone;
}

export const eventDisplayMap: Record<EventType, EventDisplayMeta> = {
  BOOT: { label: "Boot", code: "SYSTEM_BOOT", icon: "power_settings_new", filled: true, tone: "primary" },
  SHUTDOWN: { label: "Shutdown", code: "SYSTEM_SHUTDOWN", icon: "power_settings_new", filled: false, tone: "neutral" },
  RESTART: { label: "Restart", code: "SYSTEM_RESTART", icon: "restart_alt", filled: false, tone: "primary" },
  LOCK: { label: "Locked", code: "SESSION_LOCK", icon: "lock", filled: false, tone: "neutral" },
  UNLOCK: { label: "Unlocked", code: "AUTH_SUCCESS", icon: "lock_open", filled: false, tone: "success" },
  SLEEP: { label: "Sleep", code: "SYSTEM_SLEEP", icon: "bedtime", filled: false, tone: "neutral" },
  WAKE: { label: "Wake", code: "SYSTEM_WAKE", icon: "bedtime", filled: true, tone: "success" },
  INTERNET_CONNECTED: { label: "Internet connected", code: "NETWORK_UP", icon: "language", filled: false, tone: "success" },
  INTERNET_DISCONNECTED: { label: "Internet disconnected", code: "NETWORK_DOWN", icon: "language", filled: false, tone: "error" },
  BATTERY_LOW: { label: "Battery low", code: "BATT_CRIT", icon: "battery_alert", filled: true, tone: "warning" },
};

const toneTextClass: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  neutral: "text-on-surface-variant",
};

const toneBgClass: Record<Tone, string> = {
  primary: "bg-primary/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
  error: "bg-error/15",
  neutral: "bg-surface-variant",
};

export function toneClasses(tone: Tone): { text: string; bg: string } {
  return { text: toneTextClass[tone], bg: toneBgClass[tone] };
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

export function formatClockTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
