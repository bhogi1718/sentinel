import type { Permission } from "@/api/organization.api";
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
  /// Shown only to members whose role allows this.
  permission?: Permission;
}

/// Navigation for one organization: the entries the member's role allows,
/// or every entry when no check is given. Device pages (live view,
/// processes, files) are reached through Devices, since they belong to a
/// device.
export function navItemsFor(orgId: string, can: (permission: Permission) => boolean = () => true): NavItem[] {
  const items: NavItem[] = [
    { to: routes.dashboard(orgId), label: "Overview", shortLabel: "Home", icon: "dashboard", end: true },
    { to: routes.devices(orgId), label: "Devices", shortLabel: "Devices", icon: "devices" },
    { to: routes.events(orgId), label: "Activity", shortLabel: "Activity", icon: "notifications" },
    { to: routes.audit(orgId), label: "Audit log", shortLabel: "Audit", icon: "policy", permission: "audit:view" },
    { to: routes.settings(orgId), label: "Settings", shortLabel: "Settings", icon: "settings" },
  ];
  return items.filter((item) => !item.permission || can(item.permission));
}
