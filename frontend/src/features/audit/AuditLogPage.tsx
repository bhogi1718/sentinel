import { useState } from "react";
import type { ListAuditParams } from "@/api/audit.api";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, PageHeader, StateBlock, StatusPill } from "@/components/ui/kit";
import { useDevices } from "@/features/devices/useDevices";
import { useCurrentOrg, useMembers } from "@/features/org/useOrg";
import { usePageMeta } from "@/lib/usePageMeta";
import type { AuditAction, AuditEntry } from "@/types/audit";
import { AUDIT_RETENTION_DAYS, auditActionDisplay, auditActorLabel, auditDetail } from "./auditDisplay";
import { useAuditLog } from "./useAuditLog";

const FIELD_CLASS =
  "rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 font-mono text-label-mono uppercase text-on-surface outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30";

/// "Oct 18, 1:05 PM" - audit entries need the date as well as the time.
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/// A yyyy-mm-dd date input's value as the start of that day, local time.
function startOfDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = auditActionDisplay[entry.action];
  const failed = entry.outcome === "FAILURE";
  const detail = auditDetail(entry);
  const error = failed && typeof entry.detail?.error === "string" ? entry.detail.error : null;
  const actor = auditActorLabel(entry);
  const device = entry.deviceName ?? "Unknown device";

  return (
    <li className="flex gap-sm px-md py-sm md:grid md:grid-cols-[minmax(0,1fr)_11rem_10rem_8rem] md:items-center md:gap-md">
      <div className="flex min-w-0 flex-1 gap-sm">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            failed ? "bg-error/15 text-error" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon name={meta.icon} size={16} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-xs">
            <span className="text-body-sm text-on-surface">{meta.label}</span>
            {failed && <StatusPill tone="danger" label="Failed" />}
          </div>
          {detail && (
            <span className="truncate font-mono text-[11px] text-on-surface-variant" title={detail}>
              {detail}
            </span>
          )}
          {error && <span className="text-[11px] text-error">{error}</span>}
          {/* On narrow screens who, where and when share one line. */}
          <span className="truncate text-[11px] text-on-surface-variant md:hidden">
            {actor} · {device} · {formatWhen(entry.occurredAt)}
          </span>
        </div>
      </div>
      <span className="hidden truncate text-body-sm text-on-surface md:block" title={entry.actorEmail}>
        {actor}
      </span>
      <span className="hidden truncate text-body-sm text-on-surface-variant md:block">{device}</span>
      <time
        dateTime={entry.occurredAt}
        title={new Date(entry.occurredAt).toLocaleString()}
        className="hidden whitespace-nowrap text-right font-mono text-[11px] text-on-surface-variant md:block"
      >
        {formatWhen(entry.occurredAt)}
      </time>
    </li>
  );
}

export function AuditLogPage() {
  usePageMeta("Audit log", "Who did what on your organization's devices.");
  const { org, can } = useCurrentOrg();
  const { data: devices } = useDevices(org.id);
  const { data: members } = useMembers(org.id, can("members:view"));

  const [page, setPage] = useState(1);
  const [action, setAction] = useState<AuditAction | "">("");
  const [actorId, setActorId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const params: ListAuditParams = {
    page,
    action: action || undefined,
    actorId: actorId || undefined,
    deviceId: deviceId || undefined,
    from: fromDate ? startOfDay(fromDate).toISOString() : undefined,
    // The "to" day is included: the range ends at the start of the next day.
    to: toDate ? new Date(startOfDay(toDate).getTime() + 86_400_000).toISOString() : undefined,
  };
  const rangeIsValid = !fromDate || !toDate || fromDate <= toDate;
  const filtered = Boolean(action || actorId || deviceId || fromDate || toDate);

  const { data, isLoading, isError, isPlaceholderData } = useAuditLog(org.id, rangeIsValid ? params : { ...params, from: undefined, to: undefined });

  /// Every filter change starts again from the first page.
  function filterBy<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  function clearFilters() {
    setAction("");
    setActorId("");
    setDeviceId("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-md">
      <PageHeader
        title="Audit log"
        subtitle={`Screenshots, live views, file access and remote commands in ${org.name} · kept ${AUDIT_RETENTION_DAYS} days`}
        icon="policy"
      />

      <div className="flex flex-col gap-sm md:flex-row md:flex-wrap md:items-center">
        <select
          aria-label="Filter by action"
          value={action}
          onChange={(e) => filterBy(setAction)(e.target.value as AuditAction | "")}
          className={FIELD_CLASS}
        >
          <option value="">All actions</option>
          {Object.entries(auditActionDisplay).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
        {members && members.length > 1 && (
          <select
            aria-label="Filter by person"
            value={actorId}
            onChange={(e) => filterBy(setActorId)(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Everyone</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name || member.email}
              </option>
            ))}
          </select>
        )}
        {devices && devices.length > 1 && (
          <select
            aria-label="Filter by device"
            value={deviceId}
            onChange={(e) => filterBy(setDeviceId)(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">All devices</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-xs">
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => filterBy(setFromDate)(e.target.value)}
            className={`${FIELD_CLASS} min-w-0 flex-1`}
          />
          <span className="font-mono text-label-mono text-on-surface-variant">to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => filterBy(setToDate)(e.target.value)}
            className={`${FIELD_CLASS} min-w-0 flex-1`}
          />
        </div>
        {filtered && (
          <Button variant="ghost" icon="close" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>
      {!rangeIsValid && <span className="text-body-sm text-error">The start date must be on or before the end date.</span>}

      {isLoading ? (
        <div className="flex flex-col gap-xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-container-low" />
          ))}
        </div>
      ) : isError ? (
        <StateBlock icon="error_outline" title="Couldn't load the audit log">
          Check your connection and try again.
        </StateBlock>
      ) : data && data.items.length > 0 ? (
        <Card className={`overflow-hidden transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
          <div className="hidden grid-cols-[minmax(0,1fr)_11rem_10rem_8rem] gap-md border-b border-outline-variant px-md py-2 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant md:grid">
            <span>Action</span>
            <span>Person</span>
            <span>Device</span>
            <span className="text-right">When</span>
          </div>
          <ul className="divide-y divide-outline-variant/60">
            {data.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </Card>
      ) : filtered ? (
        <StateBlock icon="policy" title="No entries match your filters">
          Try a different action, person, device or date range.
        </StateBlock>
      ) : (
        <StateBlock icon="policy" title="Nothing recorded yet">
          Screenshots, live views, file access and remote commands on this organization's devices will appear here.
        </StateBlock>
      )}

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
