import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commandApi } from "@/api/command.api";
import type { Command, SendCommandInput } from "@/api/command.api";

export function useSendCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendCommandInput) => commandApi.send(input),
    onSuccess: (command: Command) => {
      queryClient.setQueryData(["command", command.id], command);
    },
  });
}
