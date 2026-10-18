import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { organizationApi } from "@/api/organization.api";
import { queryKeys } from "@/api/queryKeys";
import { Button, Input } from "@/components/ui/kit";
import { routes } from "@/lib/routes";

/// Names and creates a new organization, then opens it. Used by the
/// organization switcher's dialog and by the page for users with none.
export function CreateOrganizationForm({ onCancel }: { onCancel?: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the organization a name");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const org = await organizationApi.create(trimmed);
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      navigate(routes.dashboard(org.id));
    } catch (err) {
      setError(extractErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-sm" noValidate>
      <label htmlFor="new-organization-name" className="ml-0.5 font-mono text-label-mono uppercase text-on-surface-variant">
        Organization name
      </label>
      <Input
        id="new-organization-name"
        icon="apartment"
        placeholder="Acme Studio"
        maxLength={80}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p className="text-body-sm text-error">{error}</p>}
      <div className="mt-xs flex justify-end gap-sm">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" icon="add" disabled={submitting}>
          {submitting ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
