import { useMemo, useState } from "react";
import { fileApi } from "@/api/file.api";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import { useDeviceStatus } from "@/features/device/useDeviceStatus";
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
  const { data: device } = useDeviceStatus();
  const isConnected = device?.isOnline ?? false;
  const [currentPath, setCurrentPath] = useState("");
  const { data: entries, isLoading, isError, error, refetch } = useFiles(currentPath);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    return parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join("/"),
    }));
  }, [currentPath]);

  function openFolder(name: string): void {
    setCurrentPath((prev) => (prev ? `${prev}/${name}` : name));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-md">
      <div className="flex items-center gap-xs overflow-x-auto py-1">
        <button
          type="button"
          onClick={() => setCurrentPath("")}
          className={`flex shrink-0 items-center gap-xs transition-colors ${
            currentPath === "" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <Icon name="home" size={18} />
          <span className="font-mono text-label-mono uppercase">Root</span>
        </button>
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex shrink-0 items-center gap-xs">
            <Icon name="chevron_right" size={16} className="text-on-surface-variant/50" />
            <button
              type="button"
              onClick={() => setCurrentPath(crumb.path)}
              className={`font-mono text-label-mono uppercase transition-colors ${
                index === breadcrumbs.length - 1 ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {crumb.label}
            </button>
          </div>
        ))}
      </div>

      {!isConnected ? (
        <div className="surface-card py-16 text-center text-body-sm text-on-surface-variant">
          Device is offline. Files are unavailable until the agent reconnects.
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-container-low" />
          ))}
        </div>
      ) : isError ? (
        <div className="surface-card flex flex-col items-center gap-sm py-16 text-center">
          <Icon name="folder" size={32} className="text-error" />
          <p className="text-body-sm text-error">{extractErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-xs rounded-lg bg-surface-container px-4 py-2 font-mono text-label-mono uppercase text-on-surface transition-colors hover:bg-surface-container-high"
          >
            Retry
          </button>
        </div>
      ) : entries && entries.length > 0 ? (
        <div className="flex flex-col gap-xs">
          {entries.map((entry) => (
            <div
              key={entry.name}
              className="surface-card flex items-center gap-sm p-sm"
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
                size={22}
                className={entry.isDirectory ? "text-primary" : "text-on-surface-variant"}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm text-on-surface">{entry.name}</span>
                <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                  {entry.isDirectory ? "Folder" : formatSize(entry.sizeBytes)} · {formatModifiedAt(entry.modifiedAt)}
                </span>
              </div>
              {!entry.isDirectory && (
                <a
                  href={fileApi.downloadUrl(currentPath ? `${currentPath}/${entry.name}` : entry.name)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                  title="Download"
                  aria-label={`Download ${entry.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon name="download" size={18} />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="surface-card py-16 text-center text-body-sm text-on-surface-variant">
          This folder is empty.
        </div>
      )}
    </div>
  );
}
