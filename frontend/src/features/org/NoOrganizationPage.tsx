import { Icon } from "@/components/ui/Icon";
import { Button, Card } from "@/components/ui/kit";
import { useAuth } from "@/features/auth/useAuth";

/// For a signed-in user who belongs to no organization: there is nothing
/// they can see until someone adds them to one.
export function NoOrganizationPage() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-margin-mobile">
      <Card className="flex w-full max-w-sm flex-col items-center gap-md p-lg text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon name="apartment" size={26} />
        </div>
        <div className="flex flex-col gap-xs">
          <h1 className="text-body-lg font-semibold text-on-surface">No organization yet</h1>
          <p className="text-body-sm text-on-surface-variant">
            {user?.email} isn't a member of any organization. Ask an organization owner to add you.
          </p>
        </div>
        <Button variant="secondary" icon="logout" onClick={() => void logout()}>
          Log out
        </Button>
      </Card>
    </div>
  );
}
