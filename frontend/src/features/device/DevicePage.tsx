import { useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { ScreenshotViewer } from "@/components/ui/ScreenshotViewer";
import { Card, SectionLabel, StatusPill } from "@/components/ui/kit";
import { CommandHistory } from "@/features/device/CommandHistory";
import { LiveScreenViewer } from "@/features/device/LiveScreenViewer";
import { REMOTE_COMMANDS } from "@/features/device/remoteCommands";
import type { WholeMachineCommandType } from "@/features/device/remoteCommands";
import { useMetrics } from "@/features/device/useMetrics";
import { useRemoteCommand } from "@/features/device/useRemoteCommand";
import { useScreenshot } from "@/features/device/useScreenshot";
import { useCurrentDevice } from "@/features/devices/DeviceContext";
import { useCan } from "@/features/org/useOrg";
import { formatBytes } from "@/lib/format";

function ActionButton({
  icon,
  label,
  danger = false,
  disabled = false,
  busy = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "Device is offline" : label}
      className="flex items-center justify-center gap-sm rounded-xl bg-surface-container-highest px-md py-md transition-colors active:scale-[0.98] disabled:opacity-50 hover:bg-surface-container-high"
    >
      <Icon name={icon} size={20} className={`${busy ? "animate-pulse " : ""}${danger ? "text-error" : "text-on-surface-variant"}`} />
      <span className={`font-mono text-label-mono uppercase ${danger ? "text-error" : "text-on-surface"}`}>{label}</span>
    </button>
  );
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

const POWER_COMMANDS: { type: WholeMachineCommandType; label: string }[] = [
  { type: "RESTART", label: "Reboot" },
  { type: "SHUTDOWN", label: "Shutdown" },
  { type: "SLEEP", label: "Sleep" },
  { type: "LOG_OFF", label: "Log off" },
];

/// The Overview tab of a device: live view, vitals, remote actions and the
/// device's command history. Each section appears only for roles allowed
/// to use it.
export function DevicePage() {
  const { ref, device } = useCurrentDevice();
  const canViewScreen = useCan("screen:view");
  const canSendCommands = useCan("commands:send");
  const isConnected = device.isOnline;

  const { data: metrics, isError: isMetricsError, error: metricsError, refetch: refetchMetrics } = useMetrics(ref, isConnected);
  const { pendingType, requestCommand, confirm, cancel, isSending, errorMessage } = useRemoteCommand(ref);
  const pendingCommand = pendingType ? REMOTE_COMMANDS[pendingType] : null;
  const { imageUrl, capture, clear, isCapturing, isError: isScreenshotError, error: screenshotError } = useScreenshot(ref);
  const [viewerOpen, setViewerOpen] = useState(false);

  const memoryPercent = metrics ? (metrics.memoryUsedBytes / metrics.memoryTotalBytes) * 100 : null;

  function handleCapture(): void {
    setViewerOpen(true);
    capture();
  }

  function handleCloseViewer(): void {
    setViewerOpen(false);
    clear();
  }

  return (
    <div className="flex flex-col gap-gutter">
      {isMetricsError && (
        <InlineErrorBanner message={`Metrics: ${extractErrorMessage(metricsError)}`} onRetry={() => void refetchMetrics()} />
      )}

      {canViewScreen ? (
        <LiveScreenViewer deviceRef={ref} isConnected={isConnected} />
      ) : (
        <Card className="flex items-center gap-md p-md">
          <Icon name="visibility_off" size={22} className="text-on-surface-variant" />
          <span className="text-body-sm text-on-surface-variant">
            Live view and screenshots are available to admins of this organization.
          </span>
        </Card>
      )}

      {/* Performance gauges */}
      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
        <Card className="flex flex-col gap-md p-md">
          <SectionLabel>Processor Load</SectionLabel>
          <div className="flex items-end gap-lg">
            <RadialGauge percent={metrics ? Math.round(metrics.cpuPercent) : null} label={metrics ? "Live" : "Awaiting data"} colorClass="text-primary" />
            <div className="h-20 flex-1 text-center text-body-sm text-on-surface-variant">
              {metrics ? "Live processor load from the laptop agent." : isConnected ? "Waiting for the agent's first reading." : "Readings resume when the agent reconnects."}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-md p-md">
          <SectionLabel>Memory Usage</SectionLabel>
          <div className="flex items-end gap-lg">
            <RadialGauge
              percent={memoryPercent !== null ? Math.round(memoryPercent) : null}
              label={metrics ? "Live" : "Awaiting data"}
              colorClass="text-tertiary"
            />
            <div className="h-20 flex-1 text-center text-body-sm text-on-surface-variant">
              {metrics
                ? `${formatBytes(metrics.memoryUsedBytes)} of ${formatBytes(metrics.memoryTotalBytes)} in use.`
                : isConnected
                  ? "Waiting for the agent's first reading."
                  : "Readings resume when the agent reconnects."}
            </div>
          </div>
        </Card>
      </div>

      {/* Network */}
      <Card className="p-md">
        <div className="mb-md">
          <SectionLabel trailing={<StatusPill tone={metrics ? "success" : "default"} label={metrics ? "Live" : "No data"} />}>
            Network
          </SectionLabel>
        </div>
        <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
          {[
            { label: "Download", value: metrics ? formatRate(metrics.networkDownloadBytesPerSec) : "—" },
            { label: "Upload", value: metrics ? formatRate(metrics.networkUploadBytesPerSec) : "—" },
            { label: "Since Boot", value: metrics ? formatBytes(metrics.networkTotalReceivedBytes + metrics.networkTotalTransmittedBytes) : "—" },
            { label: "Ping", value: metrics?.pingMs != null ? `${metrics.pingMs} ms` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">{label}</span>
              <span className="font-mono text-body-md text-on-surface">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Remote actions, grouped */}
      {(canSendCommands || canViewScreen) && (
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-sm">
            <SectionLabel>Quick</SectionLabel>
            <div className="grid grid-cols-2 gap-sm">
              {canViewScreen && (
                <ActionButton icon="screenshot" label="Screenshot" disabled={!isConnected || isCapturing} busy={isCapturing} onClick={handleCapture} />
              )}
              {canSendCommands && (
                <ActionButton icon={REMOTE_COMMANDS.LOCK.icon} label="Lock" disabled={!isConnected} onClick={() => requestCommand("LOCK")} />
              )}
            </div>
          </div>

          {canSendCommands && (
            <div className="flex flex-col gap-sm">
              <SectionLabel>Power</SectionLabel>
              <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
                {POWER_COMMANDS.map(({ type, label }) => (
                  <ActionButton
                    key={type}
                    icon={REMOTE_COMMANDS[type].icon}
                    label={label}
                    danger={REMOTE_COMMANDS[type].danger}
                    disabled={!isConnected}
                    onClick={() => requestCommand(type)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CommandHistory deviceRef={ref} />

      <ConfirmDialog
        open={pendingCommand !== null}
        title={pendingCommand?.confirmTitle ?? ""}
        description={pendingCommand ? `${device.name}: ${pendingCommand.confirmDescription}` : ""}
        confirmLabel={pendingCommand?.label ?? "Confirm"}
        icon={pendingCommand?.icon ?? "lock"}
        danger={pendingCommand?.danger}
        isConfirming={isSending}
        errorMessage={errorMessage}
        onConfirm={confirm}
        onCancel={cancel}
      />

      <ScreenshotViewer
        open={viewerOpen}
        imageUrl={imageUrl}
        isCapturing={isCapturing}
        errorMessage={isScreenshotError ? extractErrorMessage(screenshotError) : null}
        onClose={handleCloseViewer}
        onRetry={capture}
      />
    </div>
  );
}
