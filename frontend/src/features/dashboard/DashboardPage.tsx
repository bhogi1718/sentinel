import { extractErrorMessage } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { REMOTE_COMMANDS } from "@/features/device/remoteCommands";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useMetrics } from "@/features/device/useMetrics";
import { useRemoteCommand } from "@/features/device/useRemoteCommand";
import { EventRow } from "@/features/events/EventRow";
import { useEvents } from "@/features/events/useEvents";
import { QuickActionButton } from "./QuickActionButton";

export function DashboardPage() {
  const { data: device, isError: isDeviceError, error: deviceError, refetch: refetchDevice } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const { data: metrics, isError: isMetricsError, error: metricsError, refetch: refetchMetrics } = useMetrics(isConnected);
  const { data: recentEvents, isLoading, isError: isEventsError, error: eventsError, refetch: refetchEvents } = useEvents({
    pageSize: 6,
  });
  const { pendingType, requestCommand, confirm, cancel, isSending, errorMessage } = useRemoteCommand();
  const pendingCommand = pendingType ? REMOTE_COMMANDS[pendingType] : null;

  const statFields = [
    { key: "cpu", label: "CPU", percent: metrics?.cpuPercent },
    {
      key: "ram",
      label: "Memory",
      percent: metrics ? (metrics.memoryUsedBytes / metrics.memoryTotalBytes) * 100 : undefined,
    },
    {
      key: "disk",
      label: "Storage",
      percent: metrics ? (metrics.diskUsedBytes / metrics.diskTotalBytes) * 100 : undefined,
    },
    { key: "battery", label: "Power", percent: metrics?.batteryPercent ?? undefined },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-gutter">
      {isDeviceError && (
        <InlineErrorBanner message={`Device status: ${extractErrorMessage(deviceError)}`} onRetry={() => void refetchDevice()} />
      )}
      {isMetricsError && (
        <InlineErrorBanner message={`Metrics: ${extractErrorMessage(metricsError)}`} onRetry={() => void refetchMetrics()} />
      )}

      {/* Status hero */}
      <section className="relative flex flex-col gap-sm overflow-hidden rounded-xl bg-surface-container-high p-md shadow-xl">
        <div className="absolute right-0 top-0 p-md text-on-surface opacity-10">
          <Icon name="laptop_mac" size={120} />
        </div>

        <div className="flex items-center gap-sm">
          <div className="relative flex h-3 w-3">
            {isConnected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            )}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${isConnected ? "bg-success" : "bg-outline"}`} />
          </div>
          <span className="font-mono text-label-mono uppercase tracking-widest text-primary">System Status</span>
        </div>

        <div className="flex flex-col">
          <h1 className="text-headline-lg-mobile font-semibold text-on-surface">
            {isConnected ? "Sentinel Online" : "Awaiting Agent"}
          </h1>
          <p className="max-w-xs text-body-sm text-on-surface-variant">
            {isConnected
              ? "Live connection established with your laptop agent."
              : "No agent connected yet. Once the Rust agent is running, live status appears here."}
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-5 gap-sm">
        {Object.values(REMOTE_COMMANDS).map((command) => (
          <QuickActionButton
            key={command.type}
            icon={command.icon}
            label={command.label}
            danger={command.danger}
            disabled={!isConnected}
            onClick={() => requestCommand(command.type)}
          />
        ))}
      </section>

      <ConfirmDialog
        open={pendingCommand !== null}
        title={pendingCommand?.confirmTitle ?? ""}
        description={pendingCommand?.confirmDescription ?? ""}
        confirmLabel={pendingCommand?.label ?? "Confirm"}
        icon={pendingCommand?.icon ?? "lock"}
        danger={pendingCommand?.danger}
        isConfirming={isSending}
        errorMessage={errorMessage}
        onConfirm={confirm}
        onCancel={cancel}
      />

      {/* Resource stats */}
      <section className="grid grid-cols-2 gap-gutter md:grid-cols-4">
        {statFields.map(({ key, label, percent }) => {
          const hasData = percent !== undefined && !Number.isNaN(percent);
          const clamped = hasData ? Math.min(100, Math.max(0, percent)) : 0;
          return (
            <div key={key} className="surface-card flex flex-col gap-sm p-md">
              <div className="flex items-start justify-between">
                <span className="font-mono text-label-mono uppercase text-on-surface-variant">{label}</span>
                <span className="text-body-sm font-bold text-on-surface-variant">
                  {hasData ? `${clamped.toFixed(0)}%` : "—"}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
              </div>
              <span className="font-mono text-[10px] text-on-surface-variant">
                {hasData ? "Live" : "Awaiting agent data"}
              </span>
            </div>
          );
        })}
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 className="text-body-lg font-semibold text-on-surface">Recent Activity</h2>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-xs">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-container-low" />
            ))}
          </div>
        ) : isEventsError ? (
          <InlineErrorBanner message={extractErrorMessage(eventsError)} onRetry={() => void refetchEvents()} />
        ) : recentEvents && recentEvents.items.length > 0 ? (
          <div className="flex flex-col gap-xs">
            {recentEvents.items.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="surface-card py-10 text-center text-body-sm text-on-surface-variant">
            No events recorded yet.
          </div>
        )}
      </section>
    </div>
  );
}
