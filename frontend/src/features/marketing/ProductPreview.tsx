import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/kit";

// A static picture of the console, drawn with the real UI kit and sample
// data: it matches the product's look in both themes, stays sharp at any
// size, and can never show anyone's real devices.

const DEVICES: { name: string; online: boolean; detail: string }[] = [
  { name: "Design MacBook", online: true, detail: "CPU 23% · 6.1 GB" },
  { name: "Finance desktop", online: true, detail: "CPU 8% · 4.4 GB" },
  { name: "Reception laptop", online: false, detail: "Seen 2 h ago" },
];

const EVENTS: { icon: IconName; label: string; time: string; tone: string }[] = [
  { icon: "lock", label: "Locked - Design MacBook", time: "10:42", tone: "text-primary" },
  { icon: "wifi", label: "Back online - Finance desktop", time: "10:31", tone: "text-success" },
  { icon: "battery_alert", label: "Battery low - Reception laptop", time: "09:58", tone: "text-warning" },
];

export function ProductPreview() {
  return (
    <figure aria-label="Preview of the Sentinel console" className="relative">
      <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" />
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low shadow-2xl"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-error/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Acme Studio · Overview</span>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Devices", value: "12" },
              { label: "Online", value: "11" },
              { label: "Events", value: "1,284" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">{stat.label}</div>
                <div className="font-mono text-lg font-semibold text-on-surface">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {DEVICES.map((device) => (
              <div key={device.name} className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    device.online ? "bg-primary/10 text-primary" : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  <Icon name="laptop_mac" size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm text-on-surface">{device.name}</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">{device.detail}</span>
                </div>
                <StatusPill tone={device.online ? "success" : "default"} label={device.online ? "Online" : "Offline"} />
              </div>
            ))}
          </div>

          <div className="flex flex-col divide-y divide-outline-variant/60 rounded-lg border border-outline-variant">
            {EVENTS.map((event) => (
              <div key={event.label} className="flex items-center gap-3 px-3 py-2">
                <Icon name={event.icon} size={16} className={event.tone} />
                <span className="flex-1 truncate text-body-sm text-on-surface">{event.label}</span>
                <span className="font-mono text-[10px] text-on-surface-variant">{event.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
