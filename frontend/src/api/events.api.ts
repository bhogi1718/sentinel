import type { PaginatedEvents, EventType } from "@/types/event";
import { apiClient } from "./client";
import { orgPath } from "./paths";

export interface ListEventsParams {
  page?: number;
  pageSize?: number;
  type?: EventType;
  deviceId?: string;
}

export const eventsApi = {
  async list(orgId: string, params: ListEventsParams = {}): Promise<PaginatedEvents> {
    const response = await apiClient.get<{ success: true; data: PaginatedEvents }>(`${orgPath(orgId)}/events`, { params });
    return response.data.data;
  },
};
