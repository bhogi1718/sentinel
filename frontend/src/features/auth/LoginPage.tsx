import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useState } from "react";
import type { MouseEvent } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import { loginSchema } from "./loginSchema";
import type { LoginFormValues } from "./loginSchema";
import { useAuth } from "./useAuth";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "success">("idle");

  const logoX = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 });
  const logoY = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  if (isAuthenticated) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";
    return <Navigate to={redirectTo} replace />;
  }

  function handleLogoParallax(event: MouseEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    logoX.set((event.clientX - centerX) / 6);
    logoY.set((event.clientY - centerY) / 6);
  }

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);
    try {
      await login(values.email, values.password);
      setStatus("success");
    } catch (err) {
      setFormError(extractErrorMessage(err));
    }
  }

  return (
    <div
      onMouseMove={handleLogoParallax}
      className="flex min-h-screen items-center justify-center bg-surface px-margin-mobile"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: status === "success" ? 0 : 1, y: 0, scale: status === "success" ? 0.95 : 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-lg flex flex-col items-center">
          <div className="group relative">
            <div className="absolute -inset-4 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
            <motion.div
              style={{ x: logoX, y: logoY }}
              className="relative mb-base flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary"
            >
              <Icon name="security" size={32} />
            </motion.div>
          </div>
          <h1 className="text-headline-lg-mobile font-semibold tracking-tight text-on-surface">Sentinel</h1>
          <p className="mt-xs font-mono text-label-mono uppercase tracking-[0.2em] text-primary">System Access</p>
        </div>

        <div className="surface-card relative overflow-hidden p-md shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="relative z-10 flex flex-col gap-md" noValidate>
            <div className="flex flex-col gap-xs">
              <label htmlFor="email" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
                Identity
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-on-surface-variant">
                  <Icon name="alternate_email" size={20} />
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="operator@sentinel.sys"
                  className="w-full rounded-lg bg-surface-container-highest py-3 pl-12 pr-4 text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/40"
                  {...register("email")}
                />
              </div>
              {errors.email && <p className="text-body-sm text-error">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-xs">
              <label htmlFor="password" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
                Access Key
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-on-surface-variant">
                  <Icon name="lock" size={20} />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-surface-container-highest py-3 pl-12 pr-12 text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/40"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 text-on-surface-variant transition-colors hover:text-on-surface"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} size={20} />
                </button>
              </div>
              {errors.password && <p className="text-body-sm text-error">{errors.password.message}</p>}
            </div>

            {formError && (
              <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || status === "success"}
              className="group relative mt-base w-full overflow-hidden rounded-lg bg-primary-container py-3.5 font-semibold text-on-primary transition-all active:scale-[0.98] hover:shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:opacity-70"
            >
              <span className="relative flex items-center justify-center gap-sm">
                {status === "success" ? (
                  <Icon name="check_circle" size={20} />
                ) : isSubmitting ? (
                  <Icon name="sync" size={20} className="animate-spin" />
                ) : (
                  <>
                    Authorize Session
                    <Icon name="arrow_forward" size={18} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </form>
        </div>

        <div className="mt-lg flex flex-col items-center gap-xs">
          <div className="flex items-center gap-base">
            <span className="h-px w-8 bg-outline-variant" />
            <span className="font-mono text-label-mono text-on-surface-variant/40">ENCRYPTED END-TO-END</span>
            <span className="h-px w-8 bg-outline-variant" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
