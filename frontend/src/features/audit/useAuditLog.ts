import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/api/audit.api";
import type { ListAuditParams } from "@/api/audit.api";
import { queryKeys } from "@/api/queryKeys";

export function useAuditLog(orgId: string, params: ListAuditParams) {
  return useQuery({
    queryKey: queryKeys.auditPage(orgId, params),
    queryFn: () => auditApi.list(orgId, params),
    placeholderData: (previous) => previous,
    // The log only grows while someone is using a device; refresh it on a
    // gentle interval rather than pushing every entry live.
    refetchInterval: 30_000,
  });
}
