import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { Button, PageHeader, SectionLabel, StateBlock, StatTile, StatusPill } from "@/components/ui/kit";
import { AddDeviceDialog } from "@/features/devices/AddDeviceDialog";
import { DeviceCard } from "@/features/devices/DeviceCard";
import { useDevices } from "@/features/devices/useDevices";
import { EventRow } from "@/features/events/EventRow";
import { useEvents } from "@/features/events/useEvents";
import { useCan, useCurrentOrg } from "@/features/org/useOrg";
import { routes } from "@/lib/routes";

const DEVICES_SHOWN = 4;

function ViewAll({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
    >
      View all
    </button>
  );
}

/// The organization's home: how many devices it has and how many are up,
/// the devices themselves, and the latest activity across all of them.
export function DashboardPage() {
  const navigate = useNavigate();
  const { org } = useCurrentOrg();
  const canManageDevices = useCan("devices:manage");
  const [addOpen, setAddOpen] = useState(false);

  const { data: devices, isLoading: devicesLoading, isError: devicesError, error: devicesErr, refetch: refetchDevices } = useDevices(org.id);
  const { data: recentEvents, isLoading: eventsLoading, isError: eventsError, error: eventsErr, refetch: refetchEvents } = useEvents(org.id, {
    pageSize: 6,
  });

  const total = devices?.length ?? 0;
  const online = devices?.filter((device) => device.isOnline).length ?? 0;
  const onlinePercent = total > 0 ? (online / total) * 100 : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-gutter">
      <PageHeader
        title={org.name}
        subtitle="Overview of your devices and their activity"
        icon="apartment"
        trailing={<StatusPill tone="primary" label={org.role.toLowerCase()} />}
      />

      <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
        <StatTile label="Devices" value={devices ? String(total) : "—"} icon="devices" />
        <StatTile label="Online" value={devices ? String(online) : "—"} percent={onlinePercent} tone="success" icon="wifi" />
        <StatTile label="Offline" value={devices ? String(total - online) : "—"} tone="default" icon="power_settings_new" />
        <StatTile label="Events" value={recentEvents ? String(recentEvents.pagination.total) : "—"} icon="history" />
      </div>

      <section className="flex flex-col gap-sm">
        <SectionLabel trailing={total > DEVICES_SHOWN && <ViewAll onClick={() => navigate(routes.devices(org.id))} />}>
          Devices
        </SectionLabel>
        {devicesError ? (
          <InlineErrorBanner message={extractErrorMessage(devicesErr)} onRetry={() => void refetchDevices()} />
        ) : devicesLoading ? (
          <div className="grid grid-cols-1 gap-sm md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl bg-surface-container-low" />
            ))}
          </div>
        ) : devices && devices.length > 0 ? (
          <div className="grid grid-cols-1 gap-sm md:grid-cols-2">
            {devices.slice(0, DEVICES_SHOWN).map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        ) : (
          <StateBlock icon="devices" title="No devices yet">
            {canManageDevices ? (
              <div className="flex flex-col items-center gap-md">
                <span>Add a laptop and install the agent to start monitoring it.</span>
                <Button variant="primary" icon="add" onClick={() => setAddOpen(true)}>
                  Add your first device
                </Button>
              </div>
            ) : (
              "An admin of this organization can add devices."
            )}
          </StateBlock>
        )}
      </section>

      <section className="flex flex-col gap-sm">
        <SectionLabel trailing={<ViewAll onClick={() => navigate(routes.events(org.id))} />}>Recent Activity</SectionLabel>
        {eventsError ? (
          <InlineErrorBanner message={extractErrorMessage(eventsErr)} onRetry={() => void refetchEvents()} />
        ) : eventsLoading ? (
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
          <StateBlock icon="history" title="No events recorded yet">
            Boots, locks, sleeps and network changes appear here as agents report them.
          </StateBlock>
        )}
      </section>

      {canManageDevices && <AddDeviceDialog orgId={org.id} open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
