import axios from "axios";
import { useMemo } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { Button, Card, StateBlock, StatusPill } from "@/components/ui/kit";
import { DeviceContext } from "@/features/devices/DeviceContext";
import { useDevice } from "@/features/devices/useDevices";
import { useCurrentOrg } from "@/features/org/useOrg";
import { routes } from "@/lib/routes";
import { formatRelativeTime } from "@/lib/time";

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

/// Route element for /o/:orgId/devices/:deviceId. Loads the device, shows
/// its identity and the tabs this member's role can use, and provides the
/// device to the tab pages below.
export function DeviceLayout() {
  const { org, can } = useCurrentOrg();
  const navigate = useNavigate();
  const { deviceId = "" } = useParams<{ deviceId: string }>();
  const ref = useMemo(() => ({ orgId: org.id, deviceId }), [org.id, deviceId]);
  const { data: device, isLoading, isError, error, refetch } = useDevice(ref);

  const value = useMemo(() => (device ? { ref, device } : undefined), [ref, device]);

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-gutter">
        <div className="h-24 animate-pulse rounded-xl bg-surface-container-low" />
        <div className="aspect-video animate-pulse rounded-xl bg-surface-container-low" />
      </div>
    );
  }

  if (isError && axios.isAxiosError(error) && error.response?.status === 404) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <StateBlock icon="devices" title="Device not found">
          <div className="flex flex-col items-center gap-md">
            <span>It may have been removed, or it belongs to a different organization.</span>
            <Link to={routes.devices(org.id)}>
              <span className="font-mono text-label-mono uppercase tracking-wider text-primary">Back to devices</span>
            </Link>
          </div>
        </StateBlock>
      </div>
    );
  }

  if (isError || !value) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <InlineErrorBanner message={extractErrorMessage(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  const tabs: Tab[] = [
    { to: routes.device(org.id, deviceId), label: "Overview", icon: "dashboard", end: true },
    ...(can("processes:view") ? [{ to: routes.deviceProcesses(org.id, deviceId), label: "Processes", icon: "terminal" as const }] : []),
    ...(can("files:access") ? [{ to: routes.deviceFiles(org.id, deviceId), label: "Files", icon: "folder" as const }] : []),
  ];

  return (
    <DeviceContext.Provider value={value}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-gutter">
        <Card className="flex flex-col gap-md p-md">
          <div className="flex items-start justify-between gap-md">
            <div className="flex min-w-0 items-center gap-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="laptop_mac" size={26} />
              </div>
              <div className="flex min-w-0 flex-col gap-xs">
                <h1 className="truncate text-headline-lg-mobile font-semibold leading-none text-on-surface">{value.device.name}</h1>
                <div className="flex flex-wrap items-center gap-sm">
                  <StatusPill
                    tone={value.device.isOnline ? "success" : "default"}
                    pulse={value.device.isOnline}
                    label={value.device.isOnline ? "Agent connected" : "Offline"}
                  />
                  {!value.device.isOnline && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Last seen {formatRelativeTime(value.device.lastSeenAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" icon="arrow_back" onClick={() => navigate(routes.devices(org.id))} className="hidden sm:inline-flex">
              All devices
            </Button>
          </div>

          {tabs.length > 1 && (
            <nav className="-mb-xs flex gap-xs overflow-x-auto" aria-label="Device sections">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-xs rounded-lg px-sm py-1.5 font-mono text-label-mono uppercase tracking-wider transition-colors ${
                      isActive ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                    }`
                  }
                >
                  <Icon name={tab.icon} size={16} />
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          )}
        </Card>

        <Outlet />
      </div>
    </DeviceContext.Provider>
  );
}
