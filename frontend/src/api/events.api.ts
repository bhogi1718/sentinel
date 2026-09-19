import type { PaginatedEvents, EventType } from "@/types/event";
import { apiClient } from "./client";

export interface ListEventsParams {
  page?: number;
  pageSize?: number;
  type?: EventType;
}

export const eventsApi = {
  async list(params: ListEventsParams = {}): Promise<PaginatedEvents> {
    const response = await apiClient.get<{ success: true; data: PaginatedEvents }>("/events", { params });
    return response.data.data;
  },
};
