import { Icon } from "@/components/ui/Icon";
import { eventDisplayMap, formatClockTime, toneClasses } from "@/lib/eventDisplay";
import type { SentinelEvent } from "@/types/event";

export function EventRow({ event }: { event: SentinelEvent }) {
  const meta = eventDisplayMap[event.type];
  const tone = toneClasses(meta.tone);

  return (
    <div className="group flex items-center gap-md rounded-lg bg-surface-container-low p-sm transition-colors hover:bg-surface-container-high">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.text}`}>
        <Icon name={meta.icon} size={20} filled={meta.filled} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-sm">
          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-tighter ${tone.bg} ${tone.text}`}>
            {meta.code}
          </span>
          <span className="whitespace-nowrap font-mono text-[10px] uppercase text-on-surface-variant">
            {formatClockTime(event.occurredAt)}
          </span>
        </div>
        <p className="mt-1 truncate text-body-sm text-on-surface">{meta.label} — {event.device.name}</p>
      </div>
    </div>
  );
}
