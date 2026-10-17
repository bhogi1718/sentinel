import { Dialog } from "./Dialog";
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
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      icon={icon}
      description={description}
      tone={danger ? "danger" : "primary"}
      dismissible={!isConfirming}
    >
      {errorMessage && (
        <div className="mb-md rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">{errorMessage}</div>
      )}

      <div className="flex justify-end gap-sm">
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
    </Dialog>
  );
}
