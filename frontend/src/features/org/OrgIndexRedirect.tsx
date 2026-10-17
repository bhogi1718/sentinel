import { Navigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { FullPageSpinner } from "@/components/ui/FullPageSpinner";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { routes } from "@/lib/routes";
import { lastOrganization } from "./lastOrganization";
import { useOrganizations } from "./useOrg";

/// "/" - sends the user to the organization they last used, or their first.
export function OrgIndexRedirect() {
  const { data: organizations, isLoading, isError, error, refetch } = useOrganizations();

  if (isLoading) return <FullPageSpinner />;

  if (isError || !organizations) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-md">
        <InlineErrorBanner message={`Couldn't load your organizations: ${extractErrorMessage(error)}`} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (organizations.length === 0) return <Navigate to={routes.noOrganization} replace />;

  const remembered = lastOrganization();
  const target = organizations.find((org) => org.id === remembered) ?? organizations[0];
  return <Navigate to={routes.dashboard(target.id)} replace />;
}
