import { useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { Button, PageHeader, StateBlock } from "@/components/ui/kit";
import { useCan, useCurrentOrg } from "@/features/org/useOrg";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { DeviceCard } from "./DeviceCard";
import { useDevices } from "./useDevices";

export function DevicesPage() {
  const { org } = useCurrentOrg();
  const canManage = useCan("devices:manage");
  const { data: devices, isLoading, isError, error, refetch } = useDevices(org.id);
  const [addOpen, setAddOpen] = useState(false);

  const online = devices?.filter((device) => device.isOnline).length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-md">
      <PageHeader
        title="Devices"
        subtitle={devices ? `${online} of ${devices.length} online` : `Laptops in ${org.name}`}
        icon="devices"
        trailing={
          canManage && (
            <Button variant="primary" icon="add" onClick={() => setAddOpen(true)}>
              Add device
            </Button>
          )
        }
      />

      {isError ? (
        <InlineErrorBanner message={extractErrorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="flex flex-col gap-sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl bg-surface-container-low" />
          ))}
        </div>
      ) : devices && devices.length > 0 ? (
        <div className="flex flex-col gap-sm">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      ) : (
        <StateBlock icon="devices" title="No devices yet">
          {canManage ? (
            <div className="flex flex-col items-center gap-md">
              <span>Add a laptop to start monitoring it.</span>
              <Button variant="primary" icon="add" onClick={() => setAddOpen(true)}>
                Add your first device
              </Button>
            </div>
          ) : (
            "An admin of this organization can add devices."
          )}
        </StateBlock>
      )}

      {canManage && <AddDeviceDialog orgId={org.id} open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
