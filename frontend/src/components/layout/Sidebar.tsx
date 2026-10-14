import { NavLink } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { moreNavItems, primaryNavItems, type NavItem } from "./navItems";

function NavRow({ to, label, icon }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-sm rounded-lg px-sm py-2.5 text-body-sm font-medium transition-colors ${
          isActive ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
        }`
      }
    >
      <Icon name={icon} size={18} />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-outline-variant bg-surface-container-low/60 px-sm py-lg md:flex">
      <div className="mb-xl flex items-center gap-sm px-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon name="security" size={18} />
        </div>
        <span className="text-body-sm font-semibold tracking-tight text-on-surface">Sentinel</span>
      </div>

      <nav className="flex flex-col gap-xs">
        {primaryNavItems.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}

        <span className="mt-md mb-xs px-sm font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
          More
        </span>
        {moreNavItems.map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>
    </aside>
  );
}
