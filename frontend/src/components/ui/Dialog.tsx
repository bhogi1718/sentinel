import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: IconName;
  description?: ReactNode;
  /// "danger" marks a destructive dialog: red icon, and announced to
  /// assistive tech as an alert dialog.
  tone?: "primary" | "danger";
  /// Blocks closing by backdrop click or Escape, e.g. while a request is
  /// in flight.
  dismissible?: boolean;
  className?: string;
  children: ReactNode;
}

/// Modal shell shared by every dialog in the console: backdrop, entrance
/// motion, title row and Escape-to-close.
export function Dialog({
  open,
  onClose,
  title,
  icon,
  description,
  tone = "primary",
  dismissible = true,
  className = "max-w-sm",
  children,
}: DialogProps) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-margin-mobile backdrop-blur-sm"
          onClick={dismissible ? onClose : undefined}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role={tone === "danger" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-label={title}
            className={`surface-card w-full p-md shadow-xl ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-sm">
              <div className={`rounded-lg p-xs ${tone === "danger" ? "bg-error/10 text-error" : "bg-primary/10 text-primary"}`}>
                <Icon name={icon} size={22} />
              </div>
              <div className="flex min-w-0 flex-col gap-xs">
                <h2 className="text-body-lg font-semibold text-on-surface">{title}</h2>
                {description && <div className="text-body-sm text-on-surface-variant">{description}</div>}
              </div>
            </div>
            <div className="mt-md">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
