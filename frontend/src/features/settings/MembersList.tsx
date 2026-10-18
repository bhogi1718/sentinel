import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { organizationApi } from "@/api/organization.api";
import type { Organization, OrganizationMember, OrgRole } from "@/api/organization.api";
import { queryKeys } from "@/api/queryKeys";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";

const ROLE_LABEL: Record<OrgRole, string> = { OWNER: "Owner", ADMIN: "Admin", VIEWER: "Viewer" };

/// The organization's members. Owners can change roles and remove people;
/// anyone can leave. The API enforces the same rules - including that the
/// last owner can't step down - and its messages are shown as they are.
export function MembersList({
  org,
  members,
  currentUserId,
  canManage,
}: {
  org: Organization;
  members: OrganizationMember[];
  currentUserId: string | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const leaving = removing?.userId === currentUserId;

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
    ]);
  };

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) => organizationApi.changeMemberRole(org.id, userId, role),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (userId: string) => organizationApi.removeMember(org.id, userId),
    onSuccess: async (_data, userId) => {
      setRemoving(null);
      if (userId === currentUserId) {
        // Left: this organization's pages are no longer reachable.
        await queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
        navigate(routes.app, { replace: true });
        return;
      }
      await refresh();
    },
  });

  const me = members.find((member) => member.userId === currentUserId);

  return (
    <>
      <div className="flex flex-col divide-y divide-outline-variant/60 border-t border-outline-variant">
        {members.map((member) => {
          const isMe = member.userId === currentUserId;
          return (
            <div key={member.userId} className="flex items-center gap-sm px-md py-sm">
              <Icon name="person" size={18} className="shrink-0 text-on-surface-variant" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm text-on-surface">
                  {member.name ?? member.email}
                  {isMe && <span className="text-on-surface-variant"> (you)</span>}
                </span>
                {member.name && <span className="truncate text-[11px] text-on-surface-variant">{member.email}</span>}
              </div>
              {canManage ? (
                <select
                  aria-label={`Role of ${member.name ?? member.email}`}
                  value={member.role}
                  disabled={changeRole.isPending}
                  onChange={(e) => changeRole.mutate({ userId: member.userId, role: e.target.value as OrgRole })}
                  className="rounded-md border border-outline-variant bg-surface-container px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-on-surface outline-none focus:border-primary/60"
                >
                  {(Object.keys(ROLE_LABEL) as OrgRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">{ROLE_LABEL[member.role]}</span>
              )}
              {canManage && !isMe && (
                <button
                  type="button"
                  onClick={() => setRemoving(member)}
                  aria-label={`Remove ${member.name ?? member.email}`}
                  className="rounded-md p-1 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {changeRole.isError && <p className="px-md py-xs text-body-sm text-error">{extractErrorMessage(changeRole.error)}</p>}

      {me && !org.isDemo && (
        <div className="flex justify-end border-t border-outline-variant px-md py-sm">
          <button
            type="button"
            onClick={() => setRemoving(me)}
            className="inline-flex items-center gap-xs rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
          >
            <Icon name="logout" size={14} />
            Leave organization
          </button>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        icon={leaving ? "logout" : "person"}
        danger
        title={leaving ? `Leave ${org.name}?` : `Remove ${removing?.name ?? removing?.email ?? ""}?`}
        description={
          leaving
            ? "You'll lose access to its devices straight away. An owner can invite you back."
            : "They'll lose access to this organization's devices straight away, including any live view they have open."
        }
        confirmLabel={leaving ? "Leave" : "Remove"}
        isConfirming={remove.isPending}
        errorMessage={remove.isError ? extractErrorMessage(remove.error) : null}
        onConfirm={() => removing && remove.mutate(removing.userId)}
        onCancel={() => {
          setRemoving(null);
          remove.reset();
        }}
      />
    </>
  );
}
