import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: IconName;
}

// Primary destinations get top-level tabs (bottom nav on mobile, top of the
// sidebar on desktop). The rest live under a "More" group so the mobile bar
// isn't cramped with six tiny tabs.
export const primaryNavItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", shortLabel: "Dash", icon: "dashboard" },
  { to: "/events", label: "Events", shortLabel: "Events", icon: "notifications" },
  { to: "/device", label: "Device", shortLabel: "Device", icon: "laptop_mac" },
];

export const moreNavItems: NavItem[] = [
  { to: "/files", label: "Files", shortLabel: "Files", icon: "folder" },
  { to: "/processes", label: "Processes", shortLabel: "Proc", icon: "terminal" },
  { to: "/settings", label: "Settings", shortLabel: "Set", icon: "settings" },
];

export const navItems: NavItem[] = [...primaryNavItems, ...moreNavItems];
