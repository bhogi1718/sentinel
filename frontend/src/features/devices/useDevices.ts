import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deviceApi } from "@/api/device.api";
import type { DeviceRef } from "@/api/paths";
import { queryKeys } from "@/api/queryKeys";

// Online status is also pushed live over the socket (device:status, see
// SocketProvider); the poll is a safety net in case a push is ever missed.
const STATUS_POLL_MS = 30_000;

export function useDevices(orgId: string) {
  return useQuery({
    queryKey: queryKeys.devices(orgId),
    queryFn: () => deviceApi.list(orgId),
    refetchInterval: STATUS_POLL_MS,
  });
}

export function useDevice(ref: DeviceRef) {
  return useQuery({
    queryKey: queryKeys.device(ref.deviceId),
    queryFn: () => deviceApi.get(ref),
    refetchInterval: STATUS_POLL_MS,
    retry: false,
  });
}

export function useCreatePairingCode(orgId: string) {
  return useMutation({ mutationFn: (name: string) => deviceApi.createPairingCode(orgId, name) });
}

/// Removes the device for good. Its cached data is dropped rather than
/// refetched - the caller navigates away, and the device no longer exists.
export function useRemoveDevice(ref: DeviceRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deviceApi.remove(ref),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.device(ref.deviceId), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices(ref.orgId) });
    },
  });
}
