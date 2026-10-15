import { useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, Input, PageHeader, Segmented, StateBlock } from "@/components/ui/kit";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
import { useKillProcess } from "./useKillProcess";
import { useProcesses } from "./useProcesses";

const REFETCH_DELAY_AFTER_KILL_MS = 500;

function formatMemory(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

type ProcessFilter = "all" | "apps" | "background";

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
    if (isConnected && !isFetched) void refetch();
  }, [isConnected, isFetched, refetch]);

  const filteredProcesses = useMemo(() => {
    if (!processes) return [];
    let result = processes;
    if (filter === "apps") result = result.filter((p) => p.isApp);
    if (filter === "background") result = result.filter((p) => !p.isApp);
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(term) || String(p.pid).includes(term));
    }
    return result.slice().sort((a, b) => b.cpuPercent - a.cpuPercent);
  }, [processes, search, filter]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-md">
      <PageHeader
        title="Processes"
        subtitle={processes ? `${processes.length} running` : "Live process monitor"}
        icon="terminal"
        trailing={
          <Button
            variant="secondary"
            icon="sync"
            disabled={!isConnected || isFetching}
            onClick={() => void refetch()}
            aria-label="Refresh process list"
            className={isFetching ? "[&_.material-symbols-outlined]:animate-spin" : ""}
          >
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
        <Input
          icon="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!processes || processes.length === 0}
          placeholder="Filter by name or PID…"
          className="flex-1"
        />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "apps", label: "Apps" },
            { value: "background", label: "Bg" },
          ]}
          className="sm:w-60"
        />
      </div>

      {!isConnected ? (
        <StateBlock icon="terminal" title="Device offline">
          The process list is unavailable until the agent reconnects.
        </StateBlock>
      ) : isFetching && !processes ? (
        <div className="flex flex-col gap-xs">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-container-low" />
          ))}
        </div>
      ) : isError ? (
        <StateBlock icon="error_outline" title="Could not load processes">
          <p className="text-error">{extractErrorMessage(error)}</p>
          <Button variant="secondary" className="mt-sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </StateBlock>
      ) : filteredProcesses.length > 0 ? (
        <Card className="flex flex-col divide-y divide-outline-variant/60">
          {filteredProcesses.map((process) => (
            <div key={process.pid} className="flex items-center gap-sm px-sm py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body-sm text-on-surface">{process.name}</span>
                <span className="font-mono text-[10px] uppercase text-on-surface-variant">PID {process.pid}</span>
              </div>
              <div className="flex w-16 shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-label-mono text-on-surface">{process.cpuPercent.toFixed(1)}%</span>
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, process.cpuPercent)}%` }} />
                </div>
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-label-mono text-on-surface-variant">
                {formatMemory(process.memoryBytes)}
              </span>
              <button
                type="button"
                onClick={() => requestKill(process.pid, process.name)}
                aria-label={`End task ${process.name}`}
                title="End task"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </Card>
      ) : (
        <StateBlock icon="terminal" title={processes ? "No processes match your filter" : "No process data yet"} />
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `End "${pending.name}"?` : ""}
        description={pending ? `This will immediately terminate PID ${pending.pid}. Any unsaved work in this process will be lost.` : ""}
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
