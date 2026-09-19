import { useQuery } from "@tanstack/react-query";
import { eventsApi } from "@/api/events.api";
import type { ListEventsParams } from "@/api/events.api";

export function useEvents(params: ListEventsParams = {}) {
  return useQuery({
    queryKey: ["events", { page: params.page ?? 1, pageSize: params.pageSize, type: params.type }],
    queryFn: () => eventsApi.list(params),
    placeholderData: (previous) => previous,
  });
}
