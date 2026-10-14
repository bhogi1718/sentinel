import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { moreNavItems, primaryNavItems } from "./navItems";

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const onMoreRoute = moreNavItems.some((item) => location.pathname.startsWith(item.to));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe bg-surface-container-high/90 backdrop-blur-xl md:hidden">
        <div className="flex h-16 items-center justify-between px-xs">
          {primaryNavItems.map(({ to, shortLabel, icon }) => (
            <NavLink
              key={to}
              to={to}
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
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-xs transition-all duration-200 ${
              onMoreRoute ? "font-semibold text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name="menu" size={22} />
            <span className="font-mono text-[10px] uppercase tracking-wider">More</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="w-full rounded-t-2xl bg-surface-container-high pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mt-sm mb-md h-1 w-10 rounded-full bg-outline-variant" />
              <div className="flex flex-col px-sm pb-md">
                {moreNavItems.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-sm rounded-xl px-sm py-3.5 text-body-md transition-colors ${
                        isActive ? "bg-primary/15 text-primary" : "text-on-surface hover:bg-white/5"
                      }`
                    }
                  >
                    <Icon name={icon} size={22} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
