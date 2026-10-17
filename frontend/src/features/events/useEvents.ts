import { useQuery } from "@tanstack/react-query";
import { eventsApi } from "@/api/events.api";
import type { ListEventsParams } from "@/api/events.api";
import { queryKeys } from "@/api/queryKeys";

export function useEvents(orgId: string, params: ListEventsParams = {}) {
  const normalized: ListEventsParams = {
    page: params.page ?? 1,
    pageSize: params.pageSize,
    type: params.type,
    deviceId: params.deviceId,
  };
  return useQuery({
    queryKey: queryKeys.eventsPage(orgId, normalized),
    queryFn: () => eventsApi.list(orgId, normalized),
    placeholderData: (previous) => previous,
  });
}
