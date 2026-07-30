import { useQuery } from "@tanstack/react-query";
import { deviceApi } from "@/api/device.api";

export const DEVICE_STATUS_QUERY_KEY = ["device", "status"];

export function useDeviceStatus() {
  return useQuery({
    queryKey: DEVICE_STATUS_QUERY_KEY,
    queryFn: deviceApi.getStatus,
    refetchInterval: 30_000,
  });
}
