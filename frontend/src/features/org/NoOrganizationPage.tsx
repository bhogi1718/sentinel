import { Icon } from "@/components/ui/Icon";
import { Button, Card } from "@/components/ui/kit";
import { useAuth } from "@/features/auth/useAuth";
import { CreateOrganizationForm } from "./CreateOrganizationForm";

/// For a signed-in user who belongs to no organization: they can create
/// one, or wait to be added to someone else's.
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
            {user?.email} isn't a member of any organization. Create one to add your laptops, or ask an
            organization owner to invite you.
          </p>
        </div>
        <div className="w-full text-left">
          <CreateOrganizationForm />
        </div>
        <Button variant="ghost" icon="logout" onClick={() => void logout()}>
          Log out
        </Button>
      </Card>
    </div>
  );
}
