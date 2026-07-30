import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";

export function QuickActionButton({ icon, label }: { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Remote commands ship in a later module"
      className="flex flex-col items-center justify-center gap-xs rounded-lg bg-surface-container p-sm opacity-50 transition-colors"
    >
      <Icon name={icon} size={20} className="text-on-surface" />
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
    </button>
  );
}
