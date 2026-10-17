import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commandApi } from "@/api/command.api";
import type { Command, SendCommandInput } from "@/api/command.api";
import type { DeviceRef } from "@/api/paths";
import { queryKeys } from "@/api/queryKeys";

export function useSendCommand(ref: DeviceRef) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendCommandInput) => commandApi.send(ref, input),
    onSuccess: (command: Command) => {
      queryClient.setQueryData(queryKeys.command(command.id), command);
      void queryClient.invalidateQueries({ queryKey: queryKeys.commands(ref.deviceId) });
    },
  });
}
