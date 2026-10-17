import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useCurrentOrg } from "@/features/org/useOrg";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardLayout() {
  const location = useLocation();
  const { org } = useCurrentOrg();

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {org.isDemo && (
          <div role="status" className="flex items-center justify-center gap-xs border-b border-primary/20 bg-primary/10 px-md py-1.5 text-center text-body-sm text-primary">
            <Icon name="science" size={16} />
            You're exploring a demo. Every device, event and reading here is simulated.
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-margin-mobile py-md pb-24 md:px-margin-desktop md:pb-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
