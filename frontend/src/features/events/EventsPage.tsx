import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, Input, PageHeader, StateBlock, StatusPill } from "@/components/ui/kit";
import { eventDisplayMap, formatClockTime, toneClasses } from "@/lib/eventDisplay";
import { useDevices } from "@/features/devices/useDevices";
import { useCurrentOrg } from "@/features/org/useOrg";
import type { EventType, SentinelEvent } from "@/types/event";
import { useEvents } from "./useEvents";

/// "Today" / "Yesterday" / "Wed, Oct 15" for a timeline date header.
function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/// One event on the timeline rail: a coloured node on a vertical line, then
/// the event code, label, device, and time.
function TimelineItem({ event }: { event: SentinelEvent }) {
  const meta = eventDisplayMap[event.type];
  const tone = toneClasses(meta.tone);
  return (
    <div className="relative flex gap-md pb-sm pl-1">
      {/* rail + node */}
      <div className="relative flex flex-col items-center">
        <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant ${tone.bg} ${tone.text}`}>
          <Icon name={meta.icon} size={16} filled={meta.filled} />
        </span>
        <span className="absolute top-8 h-[calc(100%-1rem)] w-px bg-outline-variant" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-md">
        <div className="flex items-center justify-between gap-sm">
          <span className={`font-mono text-[10px] uppercase tracking-wider ${tone.text}`}>{meta.code}</span>
          <span className="whitespace-nowrap font-mono text-[10px] text-on-surface-variant">{formatClockTime(event.occurredAt)}</span>
        </div>
        <span className="truncate text-body-sm text-on-surface">
          {meta.label} <span className="text-on-surface-variant">· {event.device.name}</span>
        </span>
      </div>
    </div>
  );
}

export function EventsPage() {
  const { org } = useCurrentOrg();
  const { data: devices } = useDevices(org.id);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<EventType | "">("");
  const [deviceId, setDeviceId] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, isPlaceholderData } = useEvents(org.id, {
    page,
    type: type || undefined,
    deviceId: deviceId || undefined,
  });

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.items;
    const term = search.toLowerCase();
    return data.items.filter(
      (e) => eventDisplayMap[e.type].label.toLowerCase().includes(term) || e.device.name.toLowerCase().includes(term),
    );
  }, [data, search]);

  const groupedByDay = useMemo(() => {
    const groups: { day: string; label: string; items: SentinelEvent[] }[] = [];
    for (const event of filteredItems) {
      const day = new Date(event.occurredAt).toDateString();
      let group = groups.find((g) => g.day === day);
      if (!group) {
        group = { day, label: dayLabel(new Date(event.occurredAt)), items: [] };
        groups.push(group);
      }
      group.items.push(event);
    }
    return groups;
  }, [filteredItems]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-md">
      <PageHeader
        title="Activity"
        subtitle={data ? `${data.pagination.total} events across ${org.name}` : "System event timeline"}
        icon="history"
        trailing={<StatusPill tone="success" pulse label="Live" />}
      />

      {/* Filters */}
      <div className="flex flex-col gap-sm sm:flex-row">
        <Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events…" className="flex-1" />
        {devices && devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by device"
            className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 font-mono text-label-mono uppercase text-on-surface outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          >
            <option value="">All devices</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter by event type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as EventType | "");
            setPage(1);
          }}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 font-mono text-label-mono uppercase text-on-surface outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
        >
          <option value="">All types</option>
          {Object.entries(eventDisplayMap).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex flex-col gap-xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-container-low" />
          ))}
        </div>
      ) : groupedByDay.length > 0 ? (
        <div className="flex flex-col gap-md">
          {groupedByDay.map((group) => (
            <div key={group.day} className="flex flex-col">
              <div className="mb-sm flex items-center gap-sm">
                <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">{group.label}</span>
                <span className="h-px flex-1 bg-outline-variant" />
                <span className="font-mono text-[10px] text-on-surface-variant">{group.items.length}</span>
              </div>
              <Card className="p-md">
                {group.items.map((event) => (
                  <TimelineItem key={event.id} event={event} />
                ))}
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <StateBlock icon="history" title="No events match your filters">
          Try a different device or type, or clear the search.
        </StateBlock>
      )}

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" icon="chevron_left" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <span className="font-mono text-label-mono text-on-surface-variant">
            {data.pagination.page} / {data.pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={isPlaceholderData || page >= data.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <Icon name="chevron_right" size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
