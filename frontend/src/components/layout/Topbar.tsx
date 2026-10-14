import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/features/auth/useAuth";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { navItems } from "./navItems";

function currentPageLabel(pathname: string): string {
  return navItems.find((item) => pathname.startsWith(item.to))?.label ?? "Sentinel";
}

export function Topbar() {
  const { user, logout } = useAuth();
  const { data: deviceStatus } = useDeviceStatus();
  const isOnline = deviceStatus?.isOnline ?? false;
  const location = useLocation();
  const [now, setNow] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close the account menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <header className="z-40 shrink-0 bg-surface-container/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-margin-mobile">
        <div className="flex items-center gap-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon name="security" size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-body-md uppercase leading-none tracking-tight text-on-surface">
              {currentPageLabel(location.pathname)}
            </span>
            <div className="flex items-center gap-xs">
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-success" : "bg-outline"}`} />
              <span className="font-mono text-label-mono uppercase text-on-surface-variant">
                {isOnline ? "System Online" : "Awaiting Agent"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-xs">
          <ThemeToggle />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Icon name="person" size={18} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high shadow-xl">
                <div className="flex flex-col gap-0.5 px-md py-sm">
                  <span className="truncate text-body-sm text-on-surface">{user?.email}</span>
                  <span className="font-mono text-label-mono text-on-surface-variant">
                    {now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                    {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-sm border-t border-outline-variant px-md py-sm text-body-sm text-on-surface-variant transition-colors hover:bg-white/5 hover:text-error"
                >
                  <Icon name="logout" size={18} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
