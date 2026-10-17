import { useMemo, useState } from "react";
import { fileApi } from "@/api/file.api";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, Input, PageHeader, StateBlock } from "@/components/ui/kit";
import { useCurrentDevice } from "@/features/devices/DeviceContext";
import { useFiles } from "./useFiles";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatModifiedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function FilesPage() {
  const { ref, device } = useCurrentDevice();
  const isConnected = device.isOnline;
  const [currentPath, setCurrentPath] = useState("");
  const [search, setSearch] = useState("");
  const { data: entries, isLoading, isError, error, refetch } = useFiles(ref, currentPath, isConnected);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    return parts.map((part, index) => ({ label: part, path: parts.slice(0, index + 1).join("/") }));
  }, [currentPath]);

  const visibleEntries = useMemo(() => {
    const list = entries ?? [];
    const term = search.trim().toLowerCase();
    const filtered = term ? list.filter((e) => e.name.toLowerCase().includes(term)) : list;
    return [...filtered].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory));
  }, [entries, search]);

  function openFolder(name: string): void {
    setCurrentPath((prev) => (prev ? `${prev}/${name}` : name));
    setSearch("");
  }

  return (
    <div className="flex flex-col gap-md">
      <PageHeader title="Files" subtitle={`Browse and download from ${device.name}`} icon="folder" />

      {/* Breadcrumb path */}
      <div className="flex items-center gap-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setCurrentPath("")}
          className={`flex shrink-0 items-center gap-xs rounded-md px-1.5 py-1 transition-colors ${currentPath === "" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
        >
          <Icon name="home" size={16} />
          <span className="font-mono text-label-mono uppercase">Root</span>
        </button>
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex shrink-0 items-center gap-xs">
            <Icon name="chevron_right" size={14} className="text-on-surface-variant/50" />
            <button
              type="button"
              onClick={() => setCurrentPath(crumb.path)}
              className={`font-mono text-label-mono uppercase transition-colors ${index === breadcrumbs.length - 1 ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              {crumb.label}
            </button>
          </div>
        ))}
      </div>

      {isConnected && <Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this folder…" />}

      {!isConnected ? (
        <StateBlock icon="folder" title="Device offline">
          Files are unavailable until the agent reconnects.
        </StateBlock>
      ) : isLoading ? (
        <div className="flex flex-col gap-xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-container-low" />
          ))}
        </div>
      ) : isError ? (
        <StateBlock icon="error_outline" title="Could not list this folder">
          <p className="text-error">{extractErrorMessage(error)}</p>
          <Button variant="secondary" className="mt-sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </StateBlock>
      ) : visibleEntries.length > 0 ? (
        <Card className="flex flex-col divide-y divide-outline-variant/60">
          {visibleEntries.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center gap-sm px-sm py-2.5 transition-colors hover:bg-surface-container/60"
              onClick={entry.isDirectory ? () => openFolder(entry.name) : undefined}
              onKeyDown={
                entry.isDirectory
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openFolder(entry.name);
                      }
                    }
                  : undefined
              }
              role={entry.isDirectory ? "button" : undefined}
              tabIndex={entry.isDirectory ? 0 : undefined}
              aria-label={entry.isDirectory ? `Open folder ${entry.name}` : undefined}
              style={entry.isDirectory ? { cursor: "pointer" } : undefined}
            >
              <Icon
                name={entry.isDirectory ? "folder" : "picture_as_pdf"}
                size={20}
                className={entry.isDirectory ? "text-primary" : "text-on-surface-variant"}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm text-on-surface">{entry.name}</span>
                <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                  {entry.isDirectory ? "Folder" : formatSize(entry.sizeBytes)} · {formatModifiedAt(entry.modifiedAt)}
                </span>
              </div>
              {entry.isDirectory ? (
                <Icon name="chevron_right" size={18} className="shrink-0 text-on-surface-variant/50" />
              ) : (
                <a
                  href={fileApi.downloadUrl(ref, currentPath ? `${currentPath}/${entry.name}` : entry.name)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                  title="Download"
                  aria-label={`Download ${entry.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon name="download" size={18} />
                </a>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <StateBlock icon="folder" title={search.trim() ? "No files match your search" : "This folder is empty"} />
      )}
    </div>
  );
}
