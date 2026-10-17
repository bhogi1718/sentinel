import { useQuery } from "@tanstack/react-query";
import { commandApi } from "@/api/command.api";
import type { DeviceRef } from "@/api/paths";
import { queryKeys } from "@/api/queryKeys";

/// The device's most recent remote commands, newest first. Kept current by
/// command:update pushes (see SocketProvider), which invalidate this key.
export function useCommandHistory(ref: DeviceRef, pageSize = 5) {
  return useQuery({
    queryKey: queryKeys.commands(ref.deviceId),
    queryFn: () => commandApi.list(ref, { pageSize }),
  });
}
