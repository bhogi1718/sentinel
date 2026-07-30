import { ComingSoon } from "@/components/ui/ComingSoon";
import { Icon } from "@/components/ui/Icon";

export function FilesPage() {
  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-center gap-xs overflow-x-auto py-1">
        <div className="flex shrink-0 items-center gap-xs text-on-surface-variant">
          <Icon name="home" size={18} className="text-primary" />
          <span className="font-mono text-label-mono uppercase">Root</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-xs">
          <button
            type="button"
            disabled
            title="File management ships in a later module"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary opacity-50"
          >
            <Icon name="upload" size={20} />
          </button>
          <button
            type="button"
            disabled
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-on-surface opacity-50"
          >
            <Icon name="create_new_folder" size={20} />
          </button>
        </div>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            disabled
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-on-surface opacity-50"
          >
            <Icon name="download" size={20} />
          </button>
          <button
            type="button"
            disabled
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-error opacity-50"
          >
            <Icon name="delete" size={20} />
          </button>
        </div>
      </div>

      <ComingSoon
        icon="folder"
        title="Remote file browser coming soon"
        description="Browse, upload, download, and delete files on your laptop once the file management module is built."
      />
    </div>
  );
}
