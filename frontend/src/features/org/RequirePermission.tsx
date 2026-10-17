import type { ReactNode } from "react";
import type { Permission } from "@/api/organization.api";
import { StateBlock } from "@/components/ui/kit";
import { useCan } from "./useOrg";

/// Renders `children` only for members whose role allows `permission`, and a
/// clear explanation otherwise - for pages reachable by URL even when their
/// navigation entry is hidden. The API refuses the same actions regardless.
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useCan(permission);
  if (allowed) return <>{children}</>;
  return (
    <StateBlock icon="shield_person" title="Not available for your role">
      Ask an admin of this organization if you need access.
    </StateBlock>
  );
}
