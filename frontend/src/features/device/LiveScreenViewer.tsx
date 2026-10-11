import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { AnnotationOverlay } from "@/features/device/AnnotationOverlay";
import { useScreenStream } from "@/features/device/useScreenStream";

interface LiveScreenViewerProps {
  isConnected: boolean;
}

/// Live screen view panel for the Device page. View-only: it renders the
/// JPEG frames the agent streams, with no input sent back to the laptop.
export function LiveScreenViewer({ isConnected }: LiveScreenViewerProps) {
  const { frameUrl, isStreaming, isStarting, error, start, stop } = useScreenStream();
  const [annotateUrl, setAnnotateUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        {frameUrl && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand to full screen"
            className="absolute right-sm top-sm flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <Icon name="fullscreen" size={18} />
          </button>
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
        {frameUrl && (
          <button
            type="button"
            onClick={() => setAnnotateUrl(frameUrl)}
            title="Freeze this frame and annotate it"
            className="flex items-center gap-xs rounded-xl bg-surface-container-highest px-md py-sm font-mono text-label-mono uppercase tracking-wider text-on-surface transition-colors active:scale-[0.98] hover:bg-surface-container-high"
          >
            <Icon name="edit" size={18} />
            Annotate
          </button>
        )}
        <span className="text-body-sm text-on-surface-variant">View-only · no input is sent to the laptop</span>
      </div>

      {annotateUrl && <AnnotationOverlay imageUrl={annotateUrl} onClose={() => setAnnotateUrl(null)} />}

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          {frameUrl ? (
            <img src={frameUrl} alt="Live screen" className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-sm text-on-surface-variant">
              <Icon name="hourglass_empty" size={32} className="animate-pulse" />
              <span className="text-body-sm">Waiting for the first frame…</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Exit full screen"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <Icon name="fullscreen_exit" size={22} />
          </button>
          {isStreaming && (
            <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-xs rounded-full bg-black/50 px-base py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-white">Live</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
