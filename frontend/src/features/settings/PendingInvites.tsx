import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { extractErrorMessage } from "@/api/client";
import { invitationApi } from "@/api/invitation.api";
import { queryKeys } from "@/api/queryKeys";
import { Icon } from "@/components/ui/Icon";

const ROLE_LABEL = { ADMIN: "Admin", VIEWER: "Viewer" } as const;

/// "in 6 days", "in 5 h", "in 20 min".
function expiresIn(iso: string): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

/// The organization's unused invite links, each revocable. For owners only.
export function PendingInvites({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { data: invitations } = useQuery({
    queryKey: queryKeys.invitations(orgId),
    queryFn: () => invitationApi.list(orgId),
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) => invitationApi.revoke(orgId, invitationId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.invitations(orgId) }),
  });

  if (!invitations || invitations.length === 0) return null;

  return (
    <div className="flex flex-col border-t border-outline-variant">
      <span className="px-md pt-sm font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
        Pending invites
      </span>
      <ul className="flex flex-col divide-y divide-outline-variant/60">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-sm px-md py-sm">
            <Icon name="schedule" size={18} className="shrink-0 text-on-surface-variant" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm text-on-surface">{invitation.note || "Invite link"}</span>
              <span className="truncate text-[11px] text-on-surface-variant">
                Expires {expiresIn(invitation.expiresAt)}
                {invitation.createdBy && ` · by ${invitation.createdBy.name ?? invitation.createdBy.email}`}
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
              {ROLE_LABEL[invitation.role]}
            </span>
            <button
              type="button"
              onClick={() => revoke.mutate(invitation.id)}
              disabled={revoke.isPending}
              className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {revoke.isError && <p className="px-md pb-sm text-body-sm text-error">{extractErrorMessage(revoke.error)}</p>}
    </div>
  );
}
