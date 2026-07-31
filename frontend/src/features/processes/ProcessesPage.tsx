import { useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useProcesses } from "./useProcesses";

function formatMemory(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function ProcessesPage() {
  const { data: device } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const [search, setSearch] = useState("");
  const { data: processes, isFetching, isError, error, refetch, isFetched } = useProcesses();

  useEffect(() => {
    if (isConnected && !isFetched) {
      void refetch();
    }
  }, [isConnected, isFetched, refetch]);

  const filteredProcesses = useMemo(() => {
    if (!processes) return [];
    if (!search.trim()) return processes;
    const term = search.toLowerCase();
    return processes.filter(
      (process) => process.name.toLowerCase().includes(term) || String(process.pid).includes(term),
    );
  }, [processes, search]);

  return (
    <div className="flex flex-col gap-md">
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
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
          >
            <Icon name="sync" size={20} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="relative flex items-center">
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
        <div className="surface-card overflow-hidden p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant">
                <th className="px-md py-sm font-mono text-label-mono uppercase">Name</th>
                <th className="px-md py-sm font-mono text-label-mono uppercase">PID</th>
                <th className="px-md py-sm text-right font-mono text-label-mono uppercase">CPU</th>
                <th className="px-md py-sm text-right font-mono text-label-mono uppercase">Memory</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses
                .slice()
                .sort((a, b) => b.cpuPercent - a.cpuPercent)
                .map((process) => (
                  <tr key={process.pid} className="border-b border-outline-variant/50 last:border-0">
                    <td className="px-md py-sm text-body-sm text-on-surface">{process.name}</td>
                    <td className="px-md py-sm font-mono text-body-sm text-on-surface-variant">{process.pid}</td>
                    <td className="px-md py-sm text-right font-mono text-body-sm text-on-surface-variant">
                      {process.cpuPercent.toFixed(1)}%
                    </td>
                    <td className="px-md py-sm text-right font-mono text-body-sm text-on-surface-variant">
                      {formatMemory(process.memoryBytes)}
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
    </div>
  );
}
