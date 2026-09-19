import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";

export function ComingSoon({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <div className="surface-card flex flex-col items-center gap-sm py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={32} />
      </div>
      <div>
        <p className="text-body-lg text-on-surface">{title}</p>
        <p className="mt-1 max-w-xs text-body-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}
