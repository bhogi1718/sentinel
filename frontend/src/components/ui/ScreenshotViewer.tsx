import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";

interface ScreenshotViewerProps {
  open: boolean;
  imageUrl: string | null;
  isCapturing: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onRetry: () => void;
}

export function ScreenshotViewer({ open, imageUrl, isCapturing, errorMessage, onClose, onRetry }: ScreenshotViewerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-md backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Screenshot"
            className="surface-card flex max-h-[90vh] w-full max-w-4xl flex-col gap-sm p-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-sm">
                <Icon name="screenshot" size={20} className="text-primary" />
                <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface">
                  Device Screenshot
                </span>
              </div>
              <div className="flex items-center gap-xs">
                {imageUrl && !isCapturing && !errorMessage && (
                  <a
                    href={imageUrl}
                    download={`sentinel-screenshot-${Date.now()}.png`}
                    aria-label="Download screenshot"
                    title="Download"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                  >
                    <Icon name="download" size={18} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close screenshot viewer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto rounded-lg bg-surface-container-low">
              {isCapturing ? (
                <div className="flex flex-col items-center gap-sm py-16 text-on-surface-variant">
                  <Icon name="sync" size={28} className="animate-spin" />
                  <span className="text-body-sm">Capturing...</span>
                </div>
              ) : errorMessage ? (
                <div className="flex flex-col items-center gap-sm px-md py-16 text-center">
                  <Icon name="error_outline" size={28} className="text-error" />
                  <p className="text-body-sm text-error">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-xs rounded-lg bg-surface-container px-4 py-2 font-mono text-label-mono uppercase text-on-surface transition-colors hover:bg-surface-container-high"
                  >
                    Retry
                  </button>
                </div>
              ) : imageUrl ? (
                <img src={imageUrl} alt="Captured device screen" className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain" />
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
