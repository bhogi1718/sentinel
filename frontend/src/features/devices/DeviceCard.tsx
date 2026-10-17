import { Link } from "react-router-dom";
import type { Device } from "@/api/device.api";
import { Icon } from "@/components/ui/Icon";
import { Card, StatusPill } from "@/components/ui/kit";
import { routes } from "@/lib/routes";
import { formatRelativeTime } from "@/lib/time";

export function DeviceCard({ device }: { device: Device }) {
  return (
    <Link
      to={routes.device(device.orgId, device.id)}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <Card interactive className="flex items-center gap-md p-md">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            device.isOnline ? "bg-primary/10 text-primary" : "bg-surface-container-highest text-on-surface-variant"
          }`}
        >
          <Icon name="laptop_mac" size={22} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <span className="truncate text-body-md font-medium text-on-surface" title={device.name}>
            {device.name}
          </span>
          <div className="flex flex-wrap items-center gap-x-sm gap-y-xs">
            <StatusPill tone={device.isOnline ? "success" : "default"} pulse={device.isOnline} label={device.isOnline ? "Online" : "Offline"} />
            {!device.isOnline && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Seen {formatRelativeTime(device.lastSeenAt)}
              </span>
            )}
          </div>
        </div>
        <Icon name="chevron_right" size={18} className="shrink-0 text-on-surface-variant/50" />
      </Card>
    </Link>
  );
}
