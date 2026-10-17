import { useState } from "react";
import type { DeviceRef } from "@/api/paths";
import { Icon } from "@/components/ui/Icon";
import { AnnotationOverlay } from "@/features/device/AnnotationOverlay";
import { useScreenStream } from "@/features/device/useScreenStream";

interface LiveScreenViewerProps {
  deviceRef: DeviceRef;
  isConnected: boolean;
}

/// Live screen view panel for the Device page. View-only: it renders the
/// JPEG frames the agent streams, with no input sent back to the laptop.
/// Controls float over the frame; frame stats (fps, staleness) sit in the
/// corner so a stalled feed is distinguishable from a slow one.
export function LiveScreenViewer({ deviceRef, isConnected }: LiveScreenViewerProps) {
  const { frameUrl, isStreaming, isStarting, error, fps, secondsSinceFrame, start, stop } = useScreenStream(deviceRef);
  const [annotateUrl, setAnnotateUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const stale = isStreaming && secondsSinceFrame > 3;

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between px-xs">
        <span className="font-mono text-label-mono uppercase tracking-widest text-on-surface-variant">Live Screen</span>
        <div className="flex items-center gap-xs">
          <span className={`h-2 w-2 rounded-full ${isStreaming ? (stale ? "bg-warning" : "animate-pulse bg-error") : "bg-outline"}`} />
          <span className="font-mono text-label-mono text-on-surface-variant">
            {isStreaming ? (stale ? "Stalled" : "Viewing") : "Idle"}
          </span>
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/70 ring-1 ring-white/5">
        {frameUrl ? (
          <img src={frameUrl} alt="Live screen" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-sm text-on-surface-variant">
            <Icon name={isStreaming ? "hourglass_empty" : "cast"} size={36} className={isStreaming ? "animate-pulse" : ""} />
            <span className="text-body-sm">{isStreaming ? "Waiting for the first frame…" : "Live view is off"}</span>
            {!isStreaming && (
              <button
                type="button"
                disabled={!isConnected || isStarting}
                onClick={start}
                className="mt-sm flex items-center gap-xs rounded-xl bg-primary px-md py-sm font-mono text-label-mono uppercase tracking-wider text-on-primary transition-colors active:scale-[0.98] disabled:opacity-50 hover:bg-primary/90"
              >
                <Icon name="play_arrow" size={18} />
                {isStarting ? "Starting…" : isConnected ? "Start live view" : "Device offline"}
              </button>
            )}
          </div>
        )}

        {/* Live / stats badge */}
        {isStreaming && frameUrl && (
          <div className="absolute left-sm top-sm flex items-center gap-xs rounded-full bg-black/60 px-base py-1 backdrop-blur-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-warning" : "animate-pulse bg-error"}`} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-white">
              {stale ? `${secondsSinceFrame.toFixed(0)}s stale` : `${fps.toFixed(1)} fps`}
            </span>
          </div>
        )}

        {/* Floating control bar */}
        {frameUrl && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-sm bg-gradient-to-t from-black/70 to-transparent p-sm">
            <FrameButton icon="stop" label="Stop" onClick={stop} />
            <FrameButton icon="edit" label="Annotate" onClick={() => setAnnotateUrl(frameUrl)} />
            <FrameButton icon="fullscreen" label="Full screen" onClick={() => setExpanded(true)} />
          </div>
        )}
      </div>

      {error && <span className="px-xs text-body-sm text-error">{error}</span>}
      <span className="px-xs text-body-sm text-on-surface-variant">View-only · no input is sent to the laptop</span>

      {annotateUrl && (
        <AnnotationOverlay deviceId={deviceRef.deviceId} imageUrl={annotateUrl} onClose={() => setAnnotateUrl(null)} />
      )}

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
              <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-warning" : "animate-pulse bg-error"}`} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-white">
                {stale ? `${secondsSinceFrame.toFixed(0)}s stale` : `${fps.toFixed(1)} fps`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FrameButton({ icon, label, onClick }: { icon: "stop" | "edit" | "fullscreen"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-xs rounded-lg bg-white/10 px-base py-1.5 font-mono text-[10px] uppercase tracking-wider text-white backdrop-blur-sm transition-colors hover:bg-white/20"
    >
      <Icon name={icon} size={16} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
