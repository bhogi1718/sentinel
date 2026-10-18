import type { IconName } from "@/components/ui/Icon";
import { REMOTE_COMMANDS } from "@/features/device/remoteCommands";
import type { WholeMachineCommandType } from "@/features/device/remoteCommands";
import { formatBytes } from "@/lib/format";
import type { AuditAction, AuditEntry } from "@/types/audit";

export const AUDIT_RETENTION_DAYS = 90;

export const auditActionDisplay: Record<AuditAction, { label: string; icon: IconName }> = {
  SCREENSHOT_CAPTURED: { label: "Took a screenshot", icon: "screenshot" },
  LIVE_VIEW_STARTED: { label: "Started a live view", icon: "cast" },
  LIVE_VIEW_ENDED: { label: "Ended a live view", icon: "stop" },
  FILES_LISTED: { label: "Opened a folder", icon: "folder" },
  FILE_DOWNLOADED: { label: "Downloaded a file", icon: "download" },
  COMMAND_SENT: { label: "Sent a command", icon: "terminal" },
};

const VIEW_END_REASONS: Record<string, string> = {
  STOPPED: "stopped by the viewer",
  DASHBOARD_CLOSED: "console closed",
  ACCESS_REVOKED: "access removed",
  DEVICE_OFFLINE: "device went offline",
};

/// "45 s", "3 min 12 s", "1 h 4 min".
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min ${totalSeconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/// The specifics of an entry in one line - which folder, which file and how
/// big, which command, how long a live view lasted - or null when there is
/// nothing beyond the action itself. A failure's reason is shown separately.
export function auditDetail(entry: AuditEntry): string | null {
  const detail = entry.detail ?? {};
  switch (entry.action) {
    case "FILES_LISTED": {
      const path = text(detail.path);
      return path ? path : "Home folder";
    }
    case "FILE_DOWNLOADED": {
      const size = number(detail.sizeBytes);
      return [text(detail.path), size === undefined ? undefined : formatBytes(size)].filter(Boolean).join(" · ") || null;
    }
    case "COMMAND_SENT": {
      const command = text(detail.command);
      if (command === "KILL_PROCESS") {
        const pid = number(detail.pid);
        return `End process ${text(detail.processName) ?? "?"}${pid === undefined ? "" : ` (PID ${pid})`}`;
      }
      return command && command in REMOTE_COMMANDS
        ? REMOTE_COMMANDS[command as WholeMachineCommandType].confirmTitle.replace(/\?$/, "")
        : (command ?? null);
    }
    case "LIVE_VIEW_ENDED": {
      const seconds = number(detail.durationSeconds);
      const reason = text(detail.reason);
      return [seconds === undefined ? undefined : `After ${formatDuration(seconds)}`, reason && VIEW_END_REASONS[reason]]
        .filter(Boolean)
        .join(" · ") || null;
    }
    default:
      return null;
  }
}

/// Who did it: their current name when the account still exists, else the
/// email recorded at the time.
export function auditActorLabel(entry: AuditEntry): string {
  return entry.actor?.name || entry.actor?.email || entry.actorEmail;
}
