import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { authApi } from "@/api/auth.api";
import { extractErrorMessage } from "@/api/client";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { changePasswordSchema } from "./changePasswordSchema";
import type { ChangePasswordFormValues } from "./changePasswordSchema";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  /// Called after the password is changed on the server (which also
  /// revokes every refresh token for the account) - the caller is
  /// responsible for actually logging the user out locally.
  onChanged: () => void;
}

export function ChangePasswordDialog({ open, onClose, onChanged }: ChangePasswordDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) });

  function handleClose(): void {
    reset();
    onClose();
  }

  async function onSubmit(values: ChangePasswordFormValues): Promise<void> {
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      reset();
      onChanged();
    } catch (err) {
      setError("currentPassword", { message: extractErrorMessage(err) });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissible={!isSubmitting}
      title="Change Password"
      icon="key"
      description="You'll be signed out of every session once your password changes."
    >
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-sm" noValidate>
        <div className="flex flex-col gap-xs">
          <label htmlFor="currentPassword" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-lg bg-surface-container-highest px-4 py-2.5 text-body-md text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/40"
            {...register("currentPassword")}
          />
          {errors.currentPassword && <p className="text-body-sm text-error">{errors.currentPassword.message}</p>}
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor="newPassword" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-lg bg-surface-container-highest px-4 py-2.5 text-body-md text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/40"
            {...register("newPassword")}
          />
          {errors.newPassword && <p className="text-body-sm text-error">{errors.newPassword.message}</p>}
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor="confirmPassword" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-lg bg-surface-container-highest px-4 py-2.5 text-body-md text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/40"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && <p className="text-body-sm text-error">{errors.confirmPassword.message}</p>}
        </div>

        <div className="mt-sm flex justify-end gap-sm">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 font-mono text-label-mono uppercase text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-xs rounded-lg bg-primary-container px-4 py-2 font-mono text-label-mono uppercase text-on-primary transition-all active:scale-[0.98] disabled:opacity-70 hover:shadow-[0_0_16px_rgba(37,99,235,0.3)]"
          >
            {isSubmitting && <Icon name="sync" size={16} className="animate-spin" />}
            Update Password
          </button>
        </div>
      </form>
    </Dialog>
  );
}
