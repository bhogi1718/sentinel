import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { REMOTE_COMMANDS } from "@/features/device/remoteCommands";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useMetrics } from "@/features/device/useMetrics";
import { useRemoteCommand } from "@/features/device/useRemoteCommand";
import type { CommandType } from "@/api/command.api";

const DEVICE_PAGE_COMMANDS: CommandType[] = ["RESTART", "LOCK", "SHUTDOWN"];

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
  const { data: device } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const { data: metrics } = useMetrics(isConnected);
  const { pendingType, requestCommand, confirm, cancel, isSending, errorMessage } = useRemoteCommand();
  const pendingCommand = pendingType ? REMOTE_COMMANDS[pendingType] : null;

  const memoryPercent = metrics ? (metrics.memoryUsedBytes / metrics.memoryTotalBytes) * 100 : null;

  return (
    <div className="flex flex-col gap-gutter">
      {/* Device identity */}
      <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-md shadow-xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 animate-pulse rounded-full bg-primary/5 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-md">
          <div className="flex flex-col gap-xs">
            <div className="flex items-center gap-base">
              <Icon name="laptop_mac" size={28} className="text-primary" />
              <h1 className="text-headline-lg-mobile font-semibold text-on-surface">Sentinel Device</h1>
            </div>
            <div className="mt-xs flex flex-wrap items-center gap-sm">
              <div className="flex items-center gap-xs rounded-full bg-surface-container px-base py-1">
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-success" : "bg-outline"}`} />
                <span className="font-mono text-label-mono text-on-surface-variant">
                  {isConnected ? "Agent connected" : "Waiting for agent"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance gauges */}
      <div className="grid grid-cols-1 gap-gutter">
        <div className="flex flex-col gap-md rounded-xl bg-surface-container-low/60 p-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-sm">
              <div className="rounded-lg bg-primary/10 p-xs text-primary">
                <Icon name="memory" size={20} />
              </div>
              <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface">Processor Load</span>
            </div>
          </div>
          <div className="flex items-end gap-lg">
            <RadialGauge percent={metrics ? Math.round(metrics.cpuPercent) : null} label={metrics ? "Live" : "Awaiting data"} colorClass="text-primary" />
            <div className="h-20 flex-1 text-center text-body-sm text-on-surface-variant">
              {metrics ? "Live processor load from the laptop agent." : "History appears once the laptop agent starts reporting CPU stats."}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-md rounded-xl bg-surface-container-low/60 p-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-sm">
              <div className="rounded-lg bg-tertiary/10 p-xs text-tertiary">
                <Icon name="memory_alt" size={20} />
              </div>
              <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface">Memory Usage</span>
            </div>
          </div>
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
        </div>
      </div>

      {/* Network */}
      <div className="rounded-xl bg-surface-container-high p-md">
        <div className="mb-md flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <Icon name="wifi" size={20} className="text-on-surface-variant" />
            <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface">Network</span>
          </div>
          <div className="flex items-center gap-xs">
            <span className={`h-2 w-2 rounded-full ${metrics ? "bg-success" : "bg-outline"}`} />
            <span className="font-mono text-label-mono text-on-surface-variant">{metrics ? "Live" : "No data yet"}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-md">
          {[
            { label: "Download", value: metrics ? formatRate(metrics.networkDownloadBytesPerSec) : "—" },
            { label: "Upload", value: metrics ? formatRate(metrics.networkUploadBytesPerSec) : "—" },
            { label: "Since Boot", value: metrics ? formatBytes(metrics.networkTotalReceivedBytes + metrics.networkTotalTransmittedBytes) : "—" },
            { label: "Ping", value: metrics?.pingMs != null ? `${metrics.pingMs} ms` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
              <span className="text-body-md text-on-surface-variant">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Remote actions */}
      <div className="flex flex-col gap-sm">
        <span className="px-xs font-mono text-label-mono uppercase tracking-widest text-on-surface-variant">
          Remote Actions
        </span>
        <div className="grid grid-cols-4 gap-sm">
          <button
            type="button"
            disabled
            title="Screenshots ship in a later module"
            className="flex flex-col items-center justify-center gap-xs rounded-xl bg-surface-container-highest p-sm opacity-50"
          >
            <Icon name="screenshot" size={20} className="text-on-surface-variant" />
            <span className="font-mono text-[10px] uppercase text-on-surface">Capture</span>
          </button>

          {DEVICE_PAGE_COMMANDS.map((type) => {
            const command = REMOTE_COMMANDS[type];
            const label = type === "RESTART" ? "Reboot" : command.label;
            return (
              <button
                key={type}
                type="button"
                disabled={!isConnected}
                onClick={() => requestCommand(type)}
                title={isConnected ? command.label : "Device is offline"}
                className="flex flex-col items-center justify-center gap-xs rounded-xl bg-surface-container-highest p-sm transition-colors active:scale-[0.97] disabled:opacity-50 hover:bg-surface-container-high"
              >
                <Icon name={command.icon} size={20} className={command.danger ? "text-error" : "text-on-surface-variant"} />
                <span className={`font-mono text-[10px] uppercase ${command.danger ? "text-error" : "text-on-surface"}`}>
                  {label}
                </span>
              </button>
            );
          })}
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
    </div>
  );
}
