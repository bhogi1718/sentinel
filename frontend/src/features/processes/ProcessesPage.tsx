import { ComingSoon } from "@/components/ui/ComingSoon";
import { Icon } from "@/components/ui/Icon";

export function ProcessesPage() {
  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-label-mono uppercase tracking-widest text-primary">Active Runtime</span>
            <h1 className="text-headline-lg-mobile font-semibold text-on-surface">System Processes</h1>
          </div>
        </div>

        <div className="relative flex items-center">
          <span className="absolute left-md text-on-surface-variant">
            <Icon name="search" size={20} />
          </span>
          <input
            disabled
            placeholder="Filter by name, PID, or user..."
            className="w-full rounded-xl bg-surface-container py-sm pl-xl pr-md text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant/50 disabled:opacity-50"
          />
        </div>
      </div>

      <ComingSoon
        icon="terminal"
        title="Process manager coming soon"
        description="View running processes and kill them remotely once the process management module is built."
      />
    </div>
  );
}
