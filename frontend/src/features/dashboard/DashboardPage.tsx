import { Icon } from "@/components/ui/Icon";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { EventRow } from "@/features/events/EventRow";
import { useEvents } from "@/features/events/useEvents";
import { QuickActionButton } from "./QuickActionButton";

const statFields = [
  { key: "cpu", label: "CPU" },
  { key: "ram", label: "Memory" },
  { key: "disk", label: "Storage" },
  { key: "battery", label: "Power" },
] as const;

export function DashboardPage() {
  const { data: device } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const { data: recentEvents, isLoading } = useEvents({ pageSize: 6 });

  return (
    <div className="flex flex-col gap-gutter">
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
        <QuickActionButton icon="lock" label="Lock" />
        <QuickActionButton icon="restart_alt" label="Reset" />
        <QuickActionButton icon="power_settings_new" label="Off" />
        <QuickActionButton icon="bedtime" label="Sleep" />
        <QuickActionButton icon="logout" label="Exit" />
      </section>

      {/* Resource stats */}
      <section className="grid grid-cols-2 gap-gutter">
        {statFields.map(({ key, label }) => (
          <div key={key} className="surface-card flex flex-col gap-sm p-md">
            <div className="flex items-start justify-between">
              <span className="font-mono text-label-mono uppercase text-on-surface-variant">{label}</span>
              <span className="text-body-sm font-bold text-on-surface-variant">—</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
              <div className="h-full w-0 rounded-full bg-primary" />
            </div>
            <span className="font-mono text-[10px] text-on-surface-variant">Awaiting agent data</span>
          </div>
        ))}
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
