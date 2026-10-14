import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { Button, Card, SectionLabel, StateBlock, StatTile, StatusPill } from "@/components/ui/kit";
import { REMOTE_COMMANDS } from "@/features/device/remoteCommands";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useMetrics } from "@/features/device/useMetrics";
import { useRemoteCommand } from "@/features/device/useRemoteCommand";
import { EventRow } from "@/features/events/EventRow";
import { useEvents } from "@/features/events/useEvents";

function pct(n: number | undefined | null): string {
  return n === undefined || n === null || Number.isNaN(n) ? "—" : `${Math.round(n)}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: device, isError: isDeviceError, error: deviceError, refetch: refetchDevice } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const { data: metrics, isError: isMetricsError, error: metricsError, refetch: refetchMetrics } = useMetrics(isConnected);
  const { data: recentEvents, isLoading, isError: isEventsError, error: eventsError, refetch: refetchEvents } = useEvents({
    pageSize: 5,
  });
  const { pendingType, requestCommand, confirm, cancel, isSending, errorMessage } = useRemoteCommand();
  const pendingCommand = pendingType ? REMOTE_COMMANDS[pendingType] : null;

  const memPct = metrics ? (metrics.memoryUsedBytes / metrics.memoryTotalBytes) * 100 : null;
  const diskPct = metrics ? (metrics.diskUsedBytes / metrics.diskTotalBytes) * 100 : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-gutter">
      {isDeviceError && (
        <InlineErrorBanner message={`Device status: ${extractErrorMessage(deviceError)}`} onRetry={() => void refetchDevice()} />
      )}
      {isMetricsError && (
        <InlineErrorBanner message={`Metrics: ${extractErrorMessage(metricsError)}`} onRetry={() => void refetchMetrics()} />
      )}

      {/* Command deck: identity + live status + primary entry to control */}
      <Card className="flex flex-col gap-md p-md">
        <div className="flex items-start justify-between gap-md">
          <div className="flex items-center gap-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="laptop_mac" size={26} />
            </div>
            <div className="flex flex-col gap-xs">
              <h1 className="text-headline-lg-mobile font-semibold leading-none text-on-surface">Sentinel Device</h1>
              <StatusPill
                tone={isConnected ? "success" : "default"}
                pulse={isConnected}
                label={isConnected ? "Online" : "Awaiting agent"}
              />
            </div>
          </div>
          <Button variant="primary" icon="cast" onClick={() => navigate("/device")} className="hidden sm:inline-flex">
            Live view
          </Button>
        </div>

        {/* Vitals strip */}
        <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
          <StatTile label="CPU" value={pct(metrics?.cpuPercent)} unit="%" percent={metrics?.cpuPercent ?? null} tone="primary" icon="memory" />
          <StatTile label="Memory" value={pct(memPct)} unit="%" percent={memPct} tone="primary" icon="memory_alt" />
          <StatTile label="Storage" value={pct(diskPct)} unit="%" percent={diskPct} tone={diskPct && diskPct > 90 ? "danger" : "primary"} icon="folder" />
          <StatTile
            label="Power"
            value={pct(metrics?.batteryPercent)}
            unit="%"
            percent={metrics?.batteryPercent ?? null}
            tone={metrics?.batteryPercent != null && metrics.batteryPercent < 20 ? "warning" : "success"}
            icon="battery_alert"
          />
        </div>
      </Card>

      {/* Remote control */}
      <section className="flex flex-col gap-sm">
        <SectionLabel>Remote Control</SectionLabel>
        <div className="grid grid-cols-3 gap-sm sm:grid-cols-5">
          {Object.values(REMOTE_COMMANDS).map((command) => (
            <Card
              as="section"
              key={command.type}
              interactive
              className="cursor-pointer"
            >
              <button
                type="button"
                disabled={!isConnected}
                onClick={() => requestCommand(command.type)}
                title={isConnected ? command.confirmTitle : "Device is offline"}
                className="flex w-full flex-col items-center gap-xs px-sm py-md disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name={command.icon} size={22} className={command.danger ? "text-error" : "text-on-surface-variant"} />
                <span className={`font-mono text-[10px] uppercase tracking-wider ${command.danger ? "text-error" : "text-on-surface"}`}>
                  {command.label}
                </span>
              </button>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-sm">
        <SectionLabel
          trailing={
            <button
              type="button"
              onClick={() => navigate("/events")}
              className="font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
            >
              View all
            </button>
          }
        >
          Recent Activity
        </SectionLabel>

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
          <StateBlock icon="history" title="No events recorded yet">
            System events will appear here as the agent reports them.
          </StateBlock>
        )}
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
    </div>
  );
}
