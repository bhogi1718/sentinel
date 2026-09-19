import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";

interface QuickActionButtonProps {
  icon: IconName;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function QuickActionButton({ icon, label, danger = false, disabled = false, onClick }: QuickActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "Device is offline" : label}
      className={`flex flex-col items-center justify-center gap-xs rounded-lg bg-surface-container p-sm transition-colors active:scale-[0.97] disabled:opacity-50 ${
        danger ? "hover:bg-error/10" : "hover:bg-surface-container-high"
      }`}
    >
      <Icon name={icon} size={20} className={danger ? "text-error" : "text-on-surface"} />
      <span className={`font-mono text-[10px] uppercase ${danger ? "text-error" : "text-on-surface-variant"}`}>
        {label}
      </span>
    </button>
  );
}
