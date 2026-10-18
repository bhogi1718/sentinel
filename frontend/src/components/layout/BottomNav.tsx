import { NavLink } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useCurrentOrg } from "@/features/org/useOrg";
import { navItemsFor } from "./navItems";

/// Mobile tab bar - the same destinations as the desktop sidebar.
export function BottomNav() {
  const { org, can } = useCurrentOrg();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe bg-surface-container-high/90 backdrop-blur-xl md:hidden">
      <div className="flex h-16 items-center justify-between px-xs">
        {navItemsFor(org.id, can).map(({ to, shortLabel, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-xs transition-all duration-200 ${
                isActive ? "font-semibold text-primary" : "text-on-surface-variant"
              }`
            }
          >
            <Icon name={icon} size={22} />
            <span className="font-mono text-[10px] uppercase tracking-wider">{shortLabel}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
