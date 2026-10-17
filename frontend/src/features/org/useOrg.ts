import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { organizationApi } from "@/api/organization.api";
import type { Permission } from "@/api/organization.api";
import { queryKeys } from "@/api/queryKeys";
import { OrgContext } from "./OrgContext";

/// The user's organizations, roles and permissions. Kept fresh so role
/// changes reach the UI quickly: refetched every minute and on returning to
/// the tab, and immediately after any 403 (see lib/queryClient.ts).
export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: organizationApi.list,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/// The organization the current page belongs to. Only usable under OrgScope.
export function useCurrentOrg() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useCurrentOrg must be used inside an organization route (OrgScope)");
  }
  return context;
}

export function useCan(permission: Permission): boolean {
  return useCurrentOrg().can(permission);
}
