import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { screenshotApi } from "@/api/screenshot.api";

/// Captures a screenshot on demand and exposes it as an object URL for an
/// <img> to render. Nothing is persisted server-side (see the module's
/// design decision: on-demand only, no stored history) - the object URL is
/// the only copy that ever exists, and only for as long as this hook stays
/// mounted or until the next capture replaces it.
export function useScreenshot() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const previousUrl = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => screenshotApi.capture(),
    onSuccess: (blob) => {
      if (previousUrl.current) {
        URL.revokeObjectURL(previousUrl.current);
      }
      const url = URL.createObjectURL(blob);
      previousUrl.current = url;
      setImageUrl(url);
    },
  });

  // Object URLs are only valid for the lifetime of the document/tab that
  // created them - revoke on unmount so a long-lived dashboard session
  // doesn't accumulate one blob URL (and its underlying memory) per capture.
  useEffect(() => {
    return () => {
      if (previousUrl.current) {
        URL.revokeObjectURL(previousUrl.current);
      }
    };
  }, []);

  function clear(): void {
    if (previousUrl.current) {
      URL.revokeObjectURL(previousUrl.current);
      previousUrl.current = null;
    }
    setImageUrl(null);
    mutation.reset();
  }

  return {
    imageUrl,
    capture: mutation.mutate,
    clear,
    isCapturing: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
