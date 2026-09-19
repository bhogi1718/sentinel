import { useQuery } from "@tanstack/react-query";
import { metricsApi } from "@/api/metrics.api";

export function useMetrics(enabled: boolean) {
  return useQuery({
    queryKey: ["device", "metrics"],
    queryFn: metricsApi.get,
    enabled,
    refetchInterval: enabled ? 5_000 : false,
  });
}
