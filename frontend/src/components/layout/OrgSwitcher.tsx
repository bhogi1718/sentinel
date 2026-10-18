import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { CreateOrganizationForm } from "@/features/org/CreateOrganizationForm";
import { useCurrentOrg } from "@/features/org/useOrg";
import { routes } from "@/lib/routes";

/// Shows the current organization, lets members of more than one switch,
/// and creates new ones. Switching goes to the other organization's
/// overview - pages below it (a device, a filter) belong to the
/// organization being left.
export function OrgSwitcher() {
  const { org, organizations } = useCurrentOrg();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // The shared demo account belongs to the demo organization only and can't
  // create others; for it the switcher is just a label.
  const canCreate = organizations.some((candidate) => !candidate.isDemo);
  const canSwitch = organizations.length > 1 || canCreate;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={!canSwitch}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup={canSwitch ? "listbox" : undefined}
        aria-expanded={canSwitch ? open : undefined}
        className="flex w-full items-center gap-sm rounded-lg border border-outline-variant bg-surface-container px-sm py-2 text-left transition-colors enabled:hover:bg-surface-container-high"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-[11px] font-semibold uppercase text-primary">
          {org.name.slice(0, 2)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-sm font-medium text-on-surface">{org.name}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">{org.role.toLowerCase()}</span>
        </div>
        {canSwitch && <Icon name="unfold_more" size={16} className="shrink-0 text-on-surface-variant" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-xs overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high py-xs shadow-xl">
          <ul role="listbox" aria-label="Organizations">
            {organizations.map((candidate) => (
              <li key={candidate.id} role="option" aria-selected={candidate.id === org.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (candidate.id !== org.id) navigate(routes.dashboard(candidate.id));
                  }}
                  className="flex w-full items-center gap-sm px-sm py-2 text-left text-body-sm text-on-surface transition-colors hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">{candidate.role.toLowerCase()}</span>
                  {candidate.id === org.id && <Icon name="check" size={16} className="text-primary" />}
                </button>
              </li>
            ))}
          </ul>
          {canCreate && (
            <div className="mt-xs border-t border-outline-variant pt-xs">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                className="flex w-full items-center gap-sm px-sm py-2 text-left text-body-sm text-primary transition-colors hover:bg-white/5"
              >
                <Icon name="add" size={16} />
                New organization
              </button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New organization"
        icon="apartment"
        description="A separate space with its own devices, members and settings. You'll be its owner."
      >
        <CreateOrganizationForm onCancel={() => setCreating(false)} />
      </Dialog>
    </div>
  );
}
