import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, Input } from "@/components/ui/kit";
import { routes } from "@/lib/routes";
import { loginSchema } from "./loginSchema";
import type { LoginFormValues } from "./loginSchema";
import { useAuth } from "./useAuth";
import { useTryDemo } from "./useTryDemo";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const demo = useTryDemo();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "success">("idle");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  if (isAuthenticated) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? routes.app;
    return <Navigate to={redirectTo} replace />;
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
    <div className="flex min-h-screen items-center justify-center bg-surface px-margin-mobile">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: status === "success" ? 0 : 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <Link to={routes.home} aria-label="Back to the Sentinel home page" className="mb-lg flex flex-col items-center gap-sm text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Icon name="security" size={28} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-display font-semibold tracking-tight text-on-surface">Sentinel</h1>
            <p className="font-mono text-label-mono uppercase tracking-[0.25em] text-primary">Console Access</p>
          </div>
        </Link>

        <Card className="p-md">
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-md" noValidate>
            <div className="flex flex-col gap-xs">
              <label htmlFor="email" className="ml-0.5 font-mono text-label-mono uppercase text-on-surface-variant">
                Email
              </label>
              <Input id="email" type="email" autoComplete="email" icon="alternate_email" placeholder="you@example.com" {...register("email")} />
              {errors.email && <p className="text-body-sm text-error">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-xs">
              <label htmlFor="password" className="ml-0.5 font-mono text-label-mono uppercase text-on-surface-variant">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Icon name="lock" size={18} />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-outline-variant bg-surface-container py-2.5 pl-10 pr-10 text-body-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-on-surface"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} size={18} />
                </button>
              </div>
              {errors.password && <p className="text-body-sm text-error">{errors.password.message}</p>}
            </div>

            {formError && (
              <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">{formError}</div>
            )}

            <Button type="submit" variant="primary" disabled={isSubmitting || status === "success"} className="mt-base w-full py-3">
              {status === "success" ? (
                <Icon name="check_circle" size={18} />
              ) : isSubmitting ? (
                <Icon name="sync" size={18} className="animate-spin" />
              ) : (
                <>
                  Authorize session
                  <Icon name="arrow_forward" size={16} />
                </>
              )}
            </Button>
          </form>
        </Card>

        {demo.enabled && (
          <Card className="mt-md flex flex-col items-center gap-sm p-md text-center">
            <span className="text-body-sm text-on-surface">No account? Explore a live demo.</span>
            <span className="text-body-sm text-on-surface-variant">A simulated laptop with real-time events, metrics and live view.</span>
            <Button variant="secondary" icon="play_arrow" onClick={() => void demo.start()} disabled={demo.starting} className="mt-xs w-full">
              {demo.starting ? "Starting demo…" : "Try the demo"}
            </Button>
            {demo.error && <p className="text-body-sm text-error">{demo.error}</p>}
          </Card>
        )}

        <p className="mt-md text-center font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">
          Role-based access · Per-organization isolation
        </p>
      </motion.div>
    </div>
  );
}
