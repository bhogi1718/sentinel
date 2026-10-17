import { useQuery } from "@tanstack/react-query";
import { fileApi } from "@/api/file.api";
import type { DeviceRef } from "@/api/paths";
import { queryKeys } from "@/api/queryKeys";

export function useFiles(ref: DeviceRef, path: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.files(ref.deviceId, path),
    queryFn: () => fileApi.list(ref, path),
    enabled,
  });
}
