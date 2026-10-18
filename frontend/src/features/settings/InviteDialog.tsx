import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { extractErrorMessage } from "@/api/client";
import { invitationApi } from "@/api/invitation.api";
import type { InvitableRole } from "@/api/invitation.api";
import { queryKeys } from "@/api/queryKeys";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog } from "@/components/ui/Dialog";
import { Button, Input, Segmented } from "@/components/ui/kit";
import { routes } from "@/lib/routes";

const ROLE_HELP: Record<InvitableRole, string> = {
  VIEWER: "Can see devices, metrics, events and processes. Can't view screens, open files or send commands.",
  ADMIN: "Everything a Viewer can do, plus screenshots, live view, files, remote commands and settings.",
};

/// Creates an invite link for the organization and shows it to copy. There's
/// no email, so the owner shares the link themselves.
export function InviteDialog({ orgId, open, onClose }: { orgId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<InvitableRole>("VIEWER");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => invitationApi.create(orgId, role, note.trim()),
    onSuccess: ({ token }) => {
      setLink(`${window.location.origin}${routes.invite(token)}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(orgId) });
    },
  });

  function close(): void {
    setRole("VIEWER");
    setNote("");
    setLink(null);
    create.reset();
    onClose();
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={link ? "Share this link" : "Invite to the organization"}
      icon="group"
      dismissible={!create.isPending}
      className="max-w-md"
      description={
        link
          ? "Send it to the person you're inviting. It works once and expires in 7 days. It won't be shown again."
          : "You'll get a link to share. Whoever opens it can join with the role you pick."
      }
    >
      {link ? (
        <div className="flex flex-col gap-md">
          <div className="flex items-center gap-xs rounded-lg border border-outline-variant bg-surface-container p-xs pl-sm">
            <input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-on-surface outline-none"
            />
            <CopyButton text={link} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-md" noValidate>
          <div className="flex flex-col gap-xs">
            <span className="ml-0.5 font-mono text-label-mono uppercase text-on-surface-variant">Role</span>
            <Segmented
              options={[
                { value: "VIEWER", label: "Viewer" },
                { value: "ADMIN", label: "Admin" },
              ]}
              value={role}
              onChange={setRole}
              className="w-full"
            />
            <p className="text-body-sm text-on-surface-variant">{ROLE_HELP[role]}</p>
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="invite-note" className="ml-0.5 font-mono text-label-mono uppercase text-on-surface-variant">
              Who it's for (optional)
            </label>
            <Input
              id="invite-note"
              icon="person"
              placeholder="Sam from finance"
              maxLength={80}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-body-sm text-on-surface-variant">Only you and other owners see this.</p>
          </div>
          {create.isError && <p className="text-body-sm text-error">{extractErrorMessage(create.error)}</p>}
          <div className="flex justify-end gap-sm">
            <Button type="button" variant="ghost" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon="add" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create link"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
