import { useQuery } from "@tanstack/react-query";
import { metricsApi } from "@/api/metrics.api";
import type { DeviceRef } from "@/api/paths";
import { queryKeys } from "@/api/queryKeys";

export function useMetrics(ref: DeviceRef, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.metrics(ref.deviceId),
    queryFn: () => metricsApi.get(ref),
    enabled,
    refetchInterval: enabled ? 5_000 : false,
  });
}
