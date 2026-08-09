import { Icon } from "./Icon";

interface InlineErrorBannerProps {
  message: string;
  onRetry: () => void;
}

// Non-blocking error surface for sections of a page backed by their own
// query (e.g. one stat tile's data source failing shouldn't hide the rest
// of the page) - contrast with the full-page error states on FilesPage/
// ProcessesPage, where the entire view is backed by a single query.
export function InlineErrorBanner({ message, onRetry }: InlineErrorBannerProps) {
  return (
    <div className="flex items-center gap-sm rounded-xl border border-error/30 bg-error/10 px-md py-sm">
      <Icon name="error_outline" size={20} className="shrink-0 text-error" />
      <p className="flex-1 text-body-sm text-error">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg bg-error/10 px-3 py-1.5 font-mono text-label-mono uppercase text-error transition-colors hover:bg-error/20"
      >
        Retry
      </button>
    </div>
  );
}
