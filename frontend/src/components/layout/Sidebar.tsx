import { NavLink } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useCurrentOrg } from "@/features/org/useOrg";
import { navItemsFor, type NavItem } from "./navItems";
import { OrgSwitcher } from "./OrgSwitcher";

function NavRow({ to, label, icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
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
  const { org, can } = useCurrentOrg();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-outline-variant bg-surface-container-low/60 px-sm py-lg md:flex">
      <div className="mb-lg flex items-center gap-sm px-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon name="security" size={18} />
        </div>
        <span className="text-body-sm font-semibold tracking-tight text-on-surface">Sentinel</span>
      </div>

      <div className="mb-lg">
        <OrgSwitcher />
      </div>

      <nav className="flex flex-col gap-xs">
        {navItemsFor(org.id, can).map((item) => (
          <NavRow key={item.to} {...item} />
        ))}
      </nav>
    </aside>
  );
}
