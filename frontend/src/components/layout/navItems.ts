import type { IconName } from "@/components/ui/Icon";

export const navItems: { to: string; label: string; shortLabel: string; icon: IconName }[] = [
  { to: "/dashboard", label: "Dashboard", shortLabel: "Dash", icon: "dashboard" },
  { to: "/events", label: "Events", shortLabel: "Events", icon: "notifications" },
  { to: "/device", label: "Device", shortLabel: "Device", icon: "laptop_mac" },
  { to: "/files", label: "Files", shortLabel: "Files", icon: "folder" },
  { to: "/processes", label: "Processes", shortLabel: "Proc", icon: "terminal" },
  { to: "/settings", label: "Settings", shortLabel: "Set", icon: "settings" },
];
