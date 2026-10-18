import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { invitationApi } from "@/api/invitation.api";
import { queryKeys } from "@/api/queryKeys";
import { FullPageSpinner } from "@/components/ui/FullPageSpinner";
import { Icon } from "@/components/ui/Icon";
import { Button, Card } from "@/components/ui/kit";
import { routes } from "@/lib/routes";
import { usePageMeta } from "@/lib/usePageMeta";
import { useAuth } from "./useAuth";

const ROLE_LABEL = { ADMIN: "Admin", VIEWER: "Viewer" } as const;

const LINK_BUTTON =
  "inline-flex w-full items-center justify-center gap-xs rounded-lg px-md py-2.5 font-mono text-label-mono uppercase tracking-wider transition-colors";

/// Where an invite link lands. Shows which organization and role it offers;
/// a signed-in visitor joins with one click, anyone else creates an account
/// or logs in first and comes straight back here to join.
export function InvitePage() {
  usePageMeta("You're invited", "Join an organization on Sentinel.");
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const offer = useQuery({
    queryKey: queryKeys.invite(token),
    queryFn: () => invitationApi.lookup(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => invitationApi.accept(token),
    onSuccess: async ({ orgId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      navigate(routes.dashboard(orgId), { replace: true });
    },
  });

  // Back from logging in to accept this invite: join without a second click.
  const autoJoined = useRef(false);
  const joinOnArrival = searchParams.get("join") === "1";
  useEffect(() => {
    if (joinOnArrival && isAuthenticated && offer.isSuccess && !autoJoined.current) {
      autoJoined.current = true;
      accept.mutate();
    }
  }, [joinOnArrival, isAuthenticated, offer.isSuccess, accept]);

  if (authLoading || offer.isLoading) return <FullPageSpinner />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-margin-mobile">
      <Card className="flex w-full max-w-sm flex-col items-center gap-md p-lg text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon name={offer.isSuccess ? "group" : "error_outline"} size={26} />
        </div>

        {offer.isSuccess ? (
          <>
            <div className="flex flex-col gap-xs">
              <h1 className="text-body-lg font-semibold text-on-surface">
                Join {offer.data.organizationName} on Sentinel
              </h1>
              <p className="text-body-sm text-on-surface-variant">
                You've been invited as {offer.data.role === "ADMIN" ? "an" : "a"}{" "}
                <span className="text-on-surface">{ROLE_LABEL[offer.data.role]}</span>.
              </p>
            </div>

            {isAuthenticated ? (
              <div className="flex w-full flex-col gap-sm">
                <Button variant="primary" className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
                  {accept.isPending ? "Joining…" : `Join ${offer.data.organizationName}`}
                </Button>
                <span className="text-[11px] text-on-surface-variant">Signed in as {user?.email}</span>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-sm">
                <Link to={`${routes.signup}?invite=${encodeURIComponent(token)}`} className={`${LINK_BUTTON} bg-primary text-on-primary hover:bg-primary/90`}>
                  Create an account
                </Link>
                <Link
                  to={routes.login}
                  state={{ from: `${routes.invite(token)}?join=1` }}
                  className={`${LINK_BUTTON} border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high`}
                >
                  I already have an account
                </Link>
              </div>
            )}
            {accept.isError && <p className="text-body-sm text-error">{extractErrorMessage(accept.error)}</p>}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-xs">
              <h1 className="text-body-lg font-semibold text-on-surface">This invite is no longer valid</h1>
              <p className="text-body-sm text-on-surface-variant">
                It may have been used, revoked or expired. Ask the person who sent it for a new link.
              </p>
            </div>
            <Link to={isAuthenticated ? routes.app : routes.home} className="text-body-sm text-primary underline-offset-4 hover:underline">
              {isAuthenticated ? "Go to your console" : "Go to the Sentinel home page"}
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
