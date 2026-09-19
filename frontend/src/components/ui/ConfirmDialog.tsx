import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  icon: IconName;
  danger?: boolean;
  isConfirming?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  icon,
  danger = false,
  isConfirming = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-margin-mobile backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="surface-card w-full max-w-sm p-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-sm">
              <div className={`rounded-lg p-xs ${danger ? "bg-error/10 text-error" : "bg-primary/10 text-primary"}`}>
                <Icon name={icon} size={22} />
              </div>
              <div className="flex flex-col gap-xs">
                <h2 id="confirm-dialog-title" className="text-body-lg font-semibold text-on-surface">
                  {title}
                </h2>
                <p className="text-body-sm text-on-surface-variant">{description}</p>
              </div>
            </div>

            {errorMessage && (
              <div className="mt-md rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
                {errorMessage}
              </div>
            )}

            <div className="mt-md flex justify-end gap-sm">
              <button
                type="button"
                onClick={onCancel}
                disabled={isConfirming}
                className="rounded-lg px-4 py-2 font-mono text-label-mono uppercase text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isConfirming}
                className={`flex items-center gap-xs rounded-lg px-4 py-2 font-mono text-label-mono uppercase transition-all active:scale-[0.98] disabled:opacity-70 ${
                  danger
                    ? "bg-error-container text-on-error-container hover:shadow-[0_0_16px_rgba(239,68,68,0.3)]"
                    : "bg-primary-container text-on-primary hover:shadow-[0_0_16px_rgba(37,99,235,0.3)]"
                }`}
              >
                {isConfirming && <Icon name="sync" size={16} className="animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
