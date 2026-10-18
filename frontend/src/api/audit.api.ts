import type { AuditAction, PaginatedAuditEntries } from "@/types/audit";
import { apiClient } from "./client";
import { orgPath } from "./paths";

export interface ListAuditParams {
  page?: number;
  pageSize?: number;
  action?: AuditAction;
  actorId?: string;
  deviceId?: string;
  /// ISO timestamps: inclusive start, exclusive end.
  from?: string;
  to?: string;
}

export const auditApi = {
  async list(orgId: string, params: ListAuditParams = {}): Promise<PaginatedAuditEntries> {
    const response = await apiClient.get<{ success: true; data: PaginatedAuditEntries }>(`${orgPath(orgId)}/audit`, {
      params,
    });
    return response.data.data;
  },
};
