import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import axios from "axios";
import { queryKeys } from "@/api/queryKeys";

/// A 403 means the user's role no longer allows something the UI offered,
/// and a 404 on an organization route can mean they were removed from it -
/// either way the cached organizations (which carry roles and permissions)
/// are out of date, so they are refetched right away instead of waiting for
/// the next scheduled refresh.
function refreshMembershipsAfter(error: unknown): void {
  if (!axios.isAxiosError(error)) return;
  const status = error.response?.status;
  const onOrgRoute = error.config?.url?.startsWith("/orgs/") ?? false;
  if (status === 403 || (status === 404 && onOrgRoute)) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: refreshMembershipsAfter }),
  mutationCache: new MutationCache({ onError: refreshMembershipsAfter }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
