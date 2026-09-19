import { useState } from "react";
import type { WholeMachineCommandType } from "./remoteCommands";
import { extractErrorMessage } from "@/api/client";
import { useSendCommand } from "./useSendCommand";

/// Drives a single confirm-then-send remote command flow: tracks which
/// command is pending confirmation, fires the mutation on confirm, and
/// surfaces the error inline so the dialog can stay open on failure
/// instead of silently closing.
export function useRemoteCommand() {
  const [pendingType, setPendingType] = useState<WholeMachineCommandType | null>(null);
  const mutation = useSendCommand();

  function requestCommand(type: WholeMachineCommandType): void {
    mutation.reset();
    setPendingType(type);
  }

  function cancel(): void {
    setPendingType(null);
    mutation.reset();
  }

  function confirm(): void {
    if (!pendingType) return;
    mutation.mutate(
      { type: pendingType },
      {
        onSuccess: () => setPendingType(null),
      },
    );
  }

  return {
    pendingType,
    requestCommand,
    confirm,
    cancel,
    isSending: mutation.isPending,
    errorMessage: mutation.isError ? extractErrorMessage(mutation.error) : null,
  };
}
