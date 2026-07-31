import { useState } from "react";
import type { CommandType } from "@/api/command.api";
import { extractErrorMessage } from "@/api/client";
import { useSendCommand } from "./useSendCommand";

/// Drives a single confirm-then-send remote command flow: tracks which
/// command is pending confirmation, fires the mutation on confirm, and
/// surfaces the error inline so the dialog can stay open on failure
/// instead of silently closing.
export function useRemoteCommand() {
  const [pendingType, setPendingType] = useState<CommandType | null>(null);
  const mutation = useSendCommand();

  function requestCommand(type: CommandType): void {
    mutation.reset();
    setPendingType(type);
  }

  function cancel(): void {
    setPendingType(null);
    mutation.reset();
  }

  function confirm(): void {
    if (!pendingType) return;
    mutation.mutate(pendingType, {
      onSuccess: () => setPendingType(null),
    });
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
