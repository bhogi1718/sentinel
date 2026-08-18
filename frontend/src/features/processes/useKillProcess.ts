import { useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { useSendCommand } from "@/features/device/useSendCommand";

interface PendingKill {
  pid: number;
  name: string;
}

/// Same confirm-then-send shape as useRemoteCommand, but scoped to a single
/// process (pid + name) rather than a fixed whole-machine command type -
/// kept separate since KILL_PROCESS's target changes per click instead of
/// being one of a handful of static buttons.
export function useKillProcess(onKilled?: () => void) {
  const [pending, setPending] = useState<PendingKill | null>(null);
  const mutation = useSendCommand();

  function requestKill(pid: number, name: string): void {
    mutation.reset();
    setPending({ pid, name });
  }

  function cancel(): void {
    setPending(null);
    mutation.reset();
  }

  function confirm(): void {
    if (!pending) return;
    mutation.mutate(
      { type: "KILL_PROCESS", pid: pending.pid, name: pending.name },
      {
        onSuccess: () => {
          setPending(null);
          onKilled?.();
        },
      },
    );
  }

  return {
    pending,
    requestKill,
    confirm,
    cancel,
    isSending: mutation.isPending,
    errorMessage: mutation.isError ? extractErrorMessage(mutation.error) : null,
  };
}
