import { useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { ScreenshotViewer } from "@/components/ui/ScreenshotViewer";
import { Card, SectionLabel, StatusPill } from "@/components/ui/kit";
import type { IconName } from "@/components/ui/Icon";
import { LiveScreenViewer } from "@/features/device/LiveScreenViewer";
import { REMOTE_COMMANDS } from "@/features/device/remoteCommands";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useMetrics } from "@/features/device/useMetrics";
import { useRemoteCommand } from "@/features/device/useRemoteCommand";
import { useScreenshot } from "@/features/device/useScreenshot";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function DevicePage() {
  const { data: device, isError: isDeviceError, error: deviceError, refetch: refetchDevice } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const { data: metrics, isError: isMetricsError, error: metricsError, refetch: refetchMetrics } = useMetrics(isConnected);
  const { pendingType, requestCommand, confirm, cancel, isSending, errorMessage } = useRemoteCommand();
  const pendingCommand = pendingType ? REMOTE_COMMANDS[pendingType] : null;
  const { imageUrl, capture, clear, isCapturing, isError: isScreenshotError, error: screenshotError } = useScreenshot();
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-gutter">
      {isDeviceError && (
        <InlineErrorBanner message={`Device status: ${extractErrorMessage(deviceError)}`} onRetry={() => void refetchDevice()} />
      )}
      {isMetricsError && (
        <InlineErrorBanner message={`Metrics: ${extractErrorMessage(metricsError)}`} onRetry={() => void refetchMetrics()} />
      )}

      {/* Device identity deck */}
      <Card className="flex items-center gap-md p-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon name="laptop_mac" size={26} />
        </div>
        <div className="flex flex-col gap-xs">
          <h1 className="text-headline-lg-mobile font-semibold leading-none text-on-surface">Sentinel Device</h1>
          <StatusPill
            tone={isConnected ? "success" : "default"}
            pulse={isConnected}
            label={isConnected ? "Agent connected" : "Awaiting agent"}
          />
        </div>
      </Card>

      {/* Live screen view (view-only) - the most-used feature, kept at top */}
      <LiveScreenViewer isConnected={isConnected} />

      {/* Performance gauges */}
      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
        <Card className="flex flex-col gap-md p-md">
          <SectionLabel>Processor Load</SectionLabel>
          <div className="flex items-end gap-lg">
            <RadialGauge percent={metrics ? Math.round(metrics.cpuPercent) : null} label={metrics ? "Live" : "Awaiting data"} colorClass="text-primary" />
            <div className="h-20 flex-1 text-center text-body-sm text-on-surface-variant">
              {metrics ? "Live processor load from the laptop agent." : "History appears once the laptop agent starts reporting CPU stats."}
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
                : "History appears once the laptop agent starts reporting memory stats."}
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
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-sm">
          <SectionLabel>Quick</SectionLabel>
          <div className="grid grid-cols-2 gap-sm">
            <ActionButton icon="screenshot" label="Screenshot" disabled={!isConnected || isCapturing} busy={isCapturing} onClick={handleCapture} />
            <ActionButton icon={REMOTE_COMMANDS.LOCK.icon} label="Lock" disabled={!isConnected} onClick={() => requestCommand("LOCK")} />
          </div>
        </div>

        <div className="flex flex-col gap-sm">
          <SectionLabel>Power</SectionLabel>
          <div className="grid grid-cols-2 gap-sm">
            <ActionButton icon={REMOTE_COMMANDS.RESTART.icon} label="Reboot" danger disabled={!isConnected} onClick={() => requestCommand("RESTART")} />
            <ActionButton icon={REMOTE_COMMANDS.SHUTDOWN.icon} label="Shutdown" danger disabled={!isConnected} onClick={() => requestCommand("SHUTDOWN")} />
          </div>
        </div>
      </div>

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
