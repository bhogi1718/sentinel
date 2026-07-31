import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commandApi } from "@/api/command.api";
import type { Command, CommandType } from "@/api/command.api";

export function useSendCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (type: CommandType) => commandApi.send(type),
    onSuccess: (command: Command) => {
      queryClient.setQueryData(["command", command.id], command);
    },
  });
}
