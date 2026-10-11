import { Icon } from "@/components/ui/Icon";
import { useScreenStream } from "@/features/device/useScreenStream";

interface LiveScreenViewerProps {
  isConnected: boolean;
}

/// Live screen view panel for the Device page. View-only: it renders the
/// JPEG frames the agent streams, with no input sent back to the laptop.
export function LiveScreenViewer({ isConnected }: LiveScreenViewerProps) {
  const { frameUrl, isStreaming, isStarting, error, start, stop } = useScreenStream();

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between px-xs">
        <span className="font-mono text-label-mono uppercase tracking-widest text-on-surface-variant">Live Screen</span>
        <div className="flex items-center gap-xs">
          <span className={`h-2 w-2 rounded-full ${isStreaming ? "animate-pulse bg-error" : "bg-outline"}`} />
          <span className="font-mono text-label-mono text-on-surface-variant">{isStreaming ? "Viewing" : "Idle"}</span>
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/60 ring-1 ring-white/5">
        {frameUrl ? (
          <img src={frameUrl} alt="Live screen" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-sm text-on-surface-variant">
            <Icon name={isStreaming ? "hourglass_empty" : "cast"} size={32} className={isStreaming ? "animate-pulse" : ""} />
            <span className="text-body-sm">
              {isStreaming ? "Waiting for the first frame…" : "Live view is off."}
            </span>
          </div>
        )}
        {isStreaming && (
          <div className="absolute left-sm top-sm flex items-center gap-xs rounded-full bg-black/60 px-base py-1 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-white">Live</span>
          </div>
        )}
      </div>

      {error && <span className="px-xs text-body-sm text-error">{error}</span>}

      <div className="flex items-center gap-sm">
        {!isStreaming ? (
          <button
            type="button"
            disabled={!isConnected || isStarting}
            onClick={start}
            title={isConnected ? "Start live view" : "Device is offline"}
            className="flex items-center gap-xs rounded-xl bg-primary px-md py-sm font-mono text-label-mono uppercase tracking-wider text-on-primary transition-colors active:scale-[0.98] disabled:opacity-50 hover:bg-primary/90"
          >
            <Icon name="play_arrow" size={18} />
            {isStarting ? "Starting…" : "Start live view"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-xs rounded-xl bg-surface-container-highest px-md py-sm font-mono text-label-mono uppercase tracking-wider text-on-surface transition-colors active:scale-[0.98] hover:bg-surface-container-high"
          >
            <Icon name="stop" size={18} />
            Stop
          </button>
        )}
        <span className="text-body-sm text-on-surface-variant">View-only · no input is sent to the laptop</span>
      </div>
    </div>
  );
}
