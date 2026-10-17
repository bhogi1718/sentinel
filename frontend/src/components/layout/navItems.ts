import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: IconName;
  /// Match only this exact path (the organization home would otherwise be
  /// "active" on every page under it).
  end?: boolean;
}

/// Navigation for one organization. Device pages (live view, processes,
/// files) are reached through Devices, since they belong to a device.
export function navItemsFor(orgId: string): NavItem[] {
  return [
    { to: routes.dashboard(orgId), label: "Overview", shortLabel: "Home", icon: "dashboard", end: true },
    { to: routes.devices(orgId), label: "Devices", shortLabel: "Devices", icon: "devices" },
    { to: routes.events(orgId), label: "Activity", shortLabel: "Activity", icon: "notifications" },
    { to: routes.settings(orgId), label: "Settings", shortLabel: "Settings", icon: "settings" },
  ];
}
