import { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import type { Permission } from "@/api/organization.api";
import { FullPageSpinner } from "@/components/ui/FullPageSpinner";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { routes } from "@/lib/routes";
import { rememberOrganization } from "./lastOrganization";
import { OrgContext } from "./OrgContext";
import { useOrganizations } from "./useOrg";

/// Route element for /o/:orgId. Resolves the organization in the URL
/// against the user's memberships and provides it to everything below.
/// An organization the user isn't in (or that doesn't exist) sends them
/// back to their default organization rather than rendering anything - but
/// only after re-fetching their memberships once, so a link to an
/// organization they were *just* added to isn't refused from a stale cache.
export function OrgScope() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: organizations, isLoading, isError, error, refetch } = useOrganizations();

  const org = organizations?.find((candidate) => candidate.id === orgId);
  const [freshlyCheckedOrgId, setFreshlyCheckedOrgId] = useState<string | null>(null);
  const missing = organizations !== undefined && !org;

  useEffect(() => {
    if (!missing || !orgId || freshlyCheckedOrgId === orgId) return;
    void refetch().finally(() => setFreshlyCheckedOrgId(orgId));
  }, [missing, orgId, freshlyCheckedOrgId, refetch]);

  const value = useMemo(() => {
    if (!org || !organizations) return undefined;
    const granted = new Set<Permission>(org.permissions);
    return { org, organizations, can: (permission: Permission) => granted.has(permission) };
  }, [org, organizations]);

  useEffect(() => {
    if (org) rememberOrganization(org.id);
  }, [org]);

  if (isLoading) return <FullPageSpinner />;

  if (isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-md">
        <InlineErrorBanner message={`Couldn't load your organizations: ${extractErrorMessage(error)}`} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!value) {
    return freshlyCheckedOrgId === orgId ? <Navigate to={routes.root} replace /> : <FullPageSpinner />;
  }

  return (
    <OrgContext.Provider value={value}>
      <Outlet />
    </OrgContext.Provider>
  );
}
