import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useSocket } from "@/realtime/useSocket";
import { navItems } from "./navItems";

function currentPageLabel(pathname: string): string {
  return navItems.find((item) => pathname.startsWith(item.to))?.label ?? "Sentinel";
}

export function Topbar() {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const location = useLocation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-surface-container/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.24)] backdrop-blur-xl">
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
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-success" : "bg-outline"}`} />
              <span className="font-mono text-label-mono uppercase text-on-surface-variant">
                {isConnected ? "System Online" : "Reconnecting"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          <div className="mr-sm hidden flex-col items-end sm:flex">
            <span className="font-mono text-label-mono text-on-surface">
              {now.toLocaleDateString(undefined, { month: "short", day: "numeric" })},{" "}
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <span className="hidden text-body-sm text-on-surface sm:inline">{user?.email}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/5 hover:text-error"
            aria-label="Log out"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
