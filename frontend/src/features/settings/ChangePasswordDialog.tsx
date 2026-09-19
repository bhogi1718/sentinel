import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { authApi } from "@/api/auth.api";
import { extractErrorMessage } from "@/api/client";
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-margin-mobile backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="surface-card w-full max-w-sm p-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-sm">
              <div className="rounded-lg bg-primary/10 p-xs text-primary">
                <Icon name="key" size={22} />
              </div>
              <div className="flex flex-col gap-xs">
                <h2 id="change-password-title" className="text-body-lg font-semibold text-on-surface">
                  Change Password
                </h2>
                <p className="text-body-sm text-on-surface-variant">
                  You'll be signed out of every session once your password changes.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="mt-md flex flex-col gap-sm" noValidate>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
