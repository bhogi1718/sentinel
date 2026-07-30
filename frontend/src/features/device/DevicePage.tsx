import { Icon } from "@/components/ui/Icon";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { useSocket } from "@/realtime/useSocket";

export function DevicePage() {
  const { isConnected } = useSocket();

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
            <RadialGauge percent={null} label="Awaiting data" colorClass="text-primary" />
            <div className="h-20 flex-1 text-center text-body-sm text-on-surface-variant">
              History appears once the laptop agent starts reporting CPU stats.
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
            <RadialGauge percent={null} label="Awaiting data" colorClass="text-tertiary" />
            <div className="h-20 flex-1 text-center text-body-sm text-on-surface-variant">
              History appears once the laptop agent starts reporting memory stats.
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
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-success" : "bg-outline"}`} />
            <span className={`font-mono text-label-mono ${isConnected ? "text-success" : "text-on-surface-variant"}`}>
              {isConnected ? "Connected" : "Offline"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-md">
          {["Download", "Upload", "Daily total", "Ping"].map((label) => (
            <div key={label} className="flex flex-col">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
              <span className="text-body-md text-on-surface-variant">—</span>
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
          {([
            ["screenshot", "Capture"],
            ["restart_alt", "Reboot"],
            ["lock", "Lock"],
            ["power_settings_new", "Off"],
          ] as const).map(([icon, label]) => (
            <button
              key={icon}
              type="button"
              disabled
              title="Remote commands ship in a later module"
              className="flex flex-col items-center justify-center gap-xs rounded-xl bg-surface-container-highest p-sm opacity-50"
            >
              <Icon name={icon} size={20} className={label === "Off" ? "text-error" : "text-on-surface-variant"} />
              <span className={`font-mono text-[10px] uppercase ${label === "Off" ? "text-error" : "text-on-surface"}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
