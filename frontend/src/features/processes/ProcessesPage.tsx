import { useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useKillProcess } from "./useKillProcess";
import { useProcesses } from "./useProcesses";

// Gives the agent a moment to actually terminate the process before the
// list is re-fetched - refetching immediately on ack would often still
// show the just-killed process, since ack only means "TerminateProcess was
// called successfully," not that the process table has updated yet.
const REFETCH_DELAY_AFTER_KILL_MS = 500;

function formatMemory(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

type ProcessFilter = "all" | "apps" | "background";

const FILTER_OPTIONS: { key: ProcessFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "apps", label: "Apps" },
  { key: "background", label: "Background" },
];

export function ProcessesPage() {
  const { data: device } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProcessFilter>("all");
  const { data: processes, isFetching, isError, error, refetch, isFetched } = useProcesses();
  const { pending, requestKill, confirm, cancel, isSending, errorMessage } = useKillProcess(() => {
    setTimeout(() => void refetch(), REFETCH_DELAY_AFTER_KILL_MS);
  });

  useEffect(() => {
    if (isConnected && !isFetched) {
      void refetch();
    }
  }, [isConnected, isFetched, refetch]);

  const filteredProcesses = useMemo(() => {
    if (!processes) return [];
    let result = processes;
    if (filter === "apps") result = result.filter((process) => process.isApp);
    if (filter === "background") result = result.filter((process) => !process.isApp);
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (process) => process.name.toLowerCase().includes(term) || String(process.pid).includes(term),
      );
    }
    return result.slice().sort((a, b) => b.cpuPercent - a.cpuPercent);
  }, [processes, search, filter]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-md">
      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-label-mono uppercase tracking-widest text-primary">Active Runtime</span>
            <h1 className="text-headline-lg-mobile font-semibold text-on-surface">System Processes</h1>
          </div>
          <button
            type="button"
            disabled={!isConnected || isFetching}
            onClick={() => void refetch()}
            title={isConnected ? "Refresh" : "Device is offline"}
            aria-label={isConnected ? "Refresh process list" : "Device is offline"}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
          >
            <Icon name="sync" size={20} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex flex-col gap-sm md:flex-row md:items-center">
          <div className="relative flex flex-1 items-center">
            <span className="absolute left-md text-on-surface-variant">
              <Icon name="search" size={20} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!processes || processes.length === 0}
              placeholder="Filter by name or PID..."
              className="w-full rounded-xl bg-surface-container py-sm pl-xl pr-md text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant/50 disabled:opacity-50"
            />
          </div>

          <div className="flex gap-xs rounded-xl bg-surface-container p-1 md:w-72">
            {FILTER_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex-1 rounded-lg py-1.5 font-mono text-label-mono uppercase transition-colors ${
                  filter === key
                    ? "bg-primary-container text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isConnected ? (
        <div className="surface-card py-16 text-center text-body-sm text-on-surface-variant">
          Device is offline. Process list is unavailable until the agent reconnects.
        </div>
      ) : isFetching && !processes ? (
        <div className="flex flex-col gap-xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-container-low" />
          ))}
        </div>
      ) : isError ? (
        <div className="surface-card flex flex-col items-center gap-sm py-16 text-center">
          <Icon name="terminal" size={32} className="text-error" />
          <p className="text-body-sm text-error">{extractErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-xs rounded-lg bg-surface-container px-4 py-2 font-mono text-label-mono uppercase text-on-surface transition-colors hover:bg-surface-container-high"
          >
            Retry
          </button>
        </div>
      ) : filteredProcesses.length > 0 ? (
        <div className="surface-card overflow-x-auto p-0">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant">
                <th className="px-md py-sm font-mono text-label-mono uppercase">Name</th>
                <th className="px-md py-sm font-mono text-label-mono uppercase">PID</th>
                <th className="px-md py-sm text-right font-mono text-label-mono uppercase">CPU</th>
                <th className="px-md py-sm text-right font-mono text-label-mono uppercase">Memory</th>
                <th className="px-md py-sm text-right font-mono text-label-mono uppercase">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((process) => (
                <tr key={process.pid} className="border-b border-outline-variant/50 last:border-0">
                  <td className="px-md py-sm text-body-sm text-on-surface">{process.name}</td>
                  <td className="px-md py-sm font-mono text-body-sm text-on-surface-variant">{process.pid}</td>
                  <td className="px-md py-sm text-right font-mono text-body-sm text-on-surface-variant">
                    {process.cpuPercent.toFixed(1)}%
                  </td>
                  <td className="px-md py-sm text-right font-mono text-body-sm text-on-surface-variant">
                    {formatMemory(process.memoryBytes)}
                  </td>
                  <td className="px-md py-sm text-right">
                    <button
                      type="button"
                      onClick={() => requestKill(process.pid, process.name)}
                      aria-label={`End task ${process.name}`}
                      title="End task"
                      className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="surface-card py-16 text-center text-body-sm text-on-surface-variant">
          {processes ? "No processes match your filter." : "No process data yet."}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `End "${pending.name}"?` : ""}
        description={
          pending
            ? `This will immediately terminate PID ${pending.pid}. Any unsaved work in this process will be lost.`
            : ""
        }
        confirmLabel="End Task"
        icon="close"
        danger
        isConfirming={isSending}
        errorMessage={errorMessage}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </div>
  );
}
