import type { Command, CommandStatus } from "@/api/command.api";
import type { DeviceRef } from "@/api/paths";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { Card, SectionLabel, StatusPill } from "@/components/ui/kit";
import { formatRelativeTime } from "@/lib/time";
import { REMOTE_COMMANDS } from "./remoteCommands";
import { useCommandHistory } from "./useCommandHistory";

const STATUS_PILL: Record<CommandStatus, { tone: "default" | "primary" | "success" | "danger"; label: string }> = {
  PENDING: { tone: "default", label: "Pending" },
  SENT: { tone: "primary", label: "Sent" },
  ACKNOWLEDGED: { tone: "success", label: "Done" },
  FAILED: { tone: "danger", label: "Failed" },
};

function describe(command: Command): string {
  if (command.type === "KILL_PROCESS") return `End ${command.targetName ?? `PID ${command.targetPid}`}`;
  return REMOTE_COMMANDS[command.type].confirmTitle.replace(/\?$/, "");
}

/// The device's latest remote commands: what was asked, by whom, and how it
/// went - the audit trail every command leaves.
export function CommandHistory({ deviceRef }: { deviceRef: DeviceRef }) {
  const { data, isLoading, isError, error, refetch } = useCommandHistory(deviceRef);

  return (
    <section className="flex flex-col gap-sm">
      <SectionLabel>Recent Commands</SectionLabel>
      {isError ? (
        <InlineErrorBanner message={extractErrorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-surface-container-low" />
      ) : data && data.items.length > 0 ? (
        <Card className="flex flex-col divide-y divide-outline-variant/60">
          {data.items.map((command) => {
            const status = STATUS_PILL[command.status];
            return (
              <div key={command.id} className="flex items-center gap-sm px-md py-sm">
                <Icon name="schedule" size={18} className="shrink-0 text-on-surface-variant" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body-sm text-on-surface">{describe(command)}</span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                    {command.requestedBy?.email ?? "Unknown requester"} · {formatRelativeTime(command.requestedAt)}
                  </span>
                  {command.status === "FAILED" && command.errorMessage && (
                    <span className="truncate text-body-sm text-error">{command.errorMessage}</span>
                  )}
                </div>
                <StatusPill tone={status.tone} label={status.label} />
              </div>
            );
          })}
        </Card>
      ) : (
        <Card className="px-md py-md text-body-sm text-on-surface-variant">No commands have been sent to this device yet.</Card>
      )}
    </section>
  );
}
