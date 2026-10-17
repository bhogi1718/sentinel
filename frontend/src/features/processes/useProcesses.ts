import { useQuery } from "@tanstack/react-query";
import type { DeviceRef } from "@/api/paths";
import { processApi } from "@/api/process.api";
import { queryKeys } from "@/api/queryKeys";

export function useProcesses(ref: DeviceRef) {
  return useQuery({
    queryKey: queryKeys.processes(ref.deviceId),
    queryFn: () => processApi.list(ref),
    enabled: false,
    staleTime: Infinity,
  });
}
