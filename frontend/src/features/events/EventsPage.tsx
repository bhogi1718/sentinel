import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { eventDisplayMap } from "@/lib/eventDisplay";
import type { EventType } from "@/types/event";
import { EventRow } from "./EventRow";
import { useEvents } from "./useEvents";

/// "Today" / "Yesterday" / "Mon, Oct 13" for a timeline date header.
function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function EventsPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<EventType | "">("");
  const [search, setSearch] = useState("");

  const { data, isLoading, isPlaceholderData } = useEvents({ page, type: type || undefined });

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.items;
    const term = search.toLowerCase();
    return data.items.filter(
      (event) =>
        eventDisplayMap[event.type].label.toLowerCase().includes(term) ||
        event.device.name.toLowerCase().includes(term),
    );
  }, [data, search]);

  const criticalCount = useMemo(
    () => (data ? data.items.filter((e) => eventDisplayMap[e.type].tone === "error").length : 0),
    [data],
  );

  // Group the visible events by calendar day for a timeline with date
  // headers, preserving the server's newest-first order.
  const groupedByDay = useMemo(() => {
    const groups: { day: string; label: string; items: typeof filteredItems }[] = [];
    for (const event of filteredItems) {
      const d = new Date(event.occurredAt);
      const day = d.toDateString();
      let group = groups.find((g) => g.day === day);
      if (!group) {
        group = { day, label: dayLabel(d), items: [] };
        groups.push(group);
      }
      group.items.push(event);
    }
    return groups;
  }, [filteredItems]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-md">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-sm">
        <div className="surface-card flex flex-col gap-xs p-md">
          <span className="font-mono text-label-mono uppercase text-on-surface-variant">Total events</span>
          <span className="text-headline-lg-mobile font-semibold text-primary">{data?.pagination.total ?? "—"}</span>
        </div>
        <div className="surface-card flex flex-col gap-xs p-md">
          <span className="font-mono text-label-mono uppercase text-on-surface-variant">Critical (page)</span>
          <span className="text-headline-lg-mobile font-semibold text-error">{criticalCount}</span>
        </div>
      </div>

      {/* Search & filters */}
      <div className="surface-card flex flex-col gap-sm p-sm">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <Icon name="search" size={20} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event details..."
            className="w-full rounded-lg bg-surface-container-highest py-3 pl-10 pr-4 text-body-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as EventType | "");
            setPage(1);
          }}
          className="rounded-lg bg-surface-container-highest px-3 py-2 font-mono text-label-mono text-on-surface outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All types</option>
          {Object.entries(eventDisplayMap).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {/* Event list */}
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between px-xs">
          <span className="font-mono text-label-mono uppercase tracking-widest text-on-surface-variant">
            Live Activity Log
          </span>
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-xs">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-container-low" />
            ))}
          </div>
        ) : groupedByDay.length > 0 ? (
          <div className="flex flex-col gap-md">
            {groupedByDay.map((group) => (
              <div key={group.day} className="flex flex-col gap-xs">
                <div className="sticky top-0 z-10 flex items-center gap-sm bg-surface/80 py-1 backdrop-blur-sm">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">{group.label}</span>
                  <span className="h-px flex-1 bg-outline-variant" />
                  <span className="font-mono text-[10px] text-on-surface-variant">{group.items.length}</span>
                </div>
                {group.items.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="surface-card py-10 text-center text-body-sm text-on-surface-variant">
            No events match your filters.
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="surface-card flex items-center justify-between p-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:opacity-30"
          >
            <Icon name="chevron_left" size={20} />
          </button>
          <span className="font-mono text-label-mono text-on-surface-variant">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={isPlaceholderData || page >= data.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:opacity-30"
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
