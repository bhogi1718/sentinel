import { NavLink } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "./navItems";

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface-container-high/90 backdrop-blur-xl md:hidden">
      <div className="flex h-16 items-center justify-between px-xs">
        {navItems.map(({ to, shortLabel, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-xs transition-all duration-200 ${
                isActive ? "font-semibold text-primary-container" : "text-on-surface-variant"
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
