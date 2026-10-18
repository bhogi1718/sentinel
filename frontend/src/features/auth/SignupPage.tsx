import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { invitationApi } from "@/api/invitation.api";
import { queryKeys } from "@/api/queryKeys";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, Input } from "@/components/ui/kit";
import { NEW_PASSWORD_MIN_LENGTH } from "@/lib/passwordRules";
import { routes } from "@/lib/routes";
import { usePageMeta } from "@/lib/usePageMeta";
import { PasswordInput } from "./PasswordInput";
import { signupSchema } from "./signupSchema";
import type { SignupFormValues } from "./signupSchema";
import { useAuth } from "./useAuth";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="ml-0.5 font-mono text-label-mono uppercase text-on-surface-variant">
        {label}
      </label>
      {children}
      {error ? <p className="text-body-sm text-error">{error}</p> : hint && <p className="text-body-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

export function SignupPage() {
  usePageMeta("Create your account", "Create a free Sentinel account and your organization.");
  const { signup, isAuthenticated } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  // Arriving from an invite link: the new account joins that organization
  // instead of creating its own.
  const inviteToken = useSearchParams()[0].get("invite") ?? undefined;
  const invite = useQuery({
    queryKey: queryKeys.invite(inviteToken ?? ""),
    queryFn: () => invitationApi.lookup(inviteToken ?? ""),
    enabled: Boolean(inviteToken),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", organizationName: "" },
  });
  const name = watch("name").trim();

  if (isAuthenticated) return <Navigate to={routes.app} replace />;

  async function onSubmit(values: SignupFormValues): Promise<void> {
    setFormError(null);
    try {
      await signup({
        name: values.name,
        email: values.email,
        password: values.password,
        organizationName: inviteToken ? undefined : values.organizationName || undefined,
        inviteToken,
      });
    } catch (err) {
      setFormError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-margin-mobile py-lg">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <Link to={routes.home} aria-label="Back to the Sentinel home page" className="mb-lg flex flex-col items-center gap-sm text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Icon name="security" size={28} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-display font-semibold tracking-tight text-on-surface">Create your account</h1>
            <p className="text-body-sm text-on-surface-variant">
              {invite.data
                ? `You'll join ${invite.data.organizationName} as ${invite.data.role === "ADMIN" ? "an Admin" : "a Viewer"}.`
                : "Free for up to two laptops. No card needed."}
            </p>
          </div>
        </Link>

        <Card className="p-md">
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-md" noValidate>
            <Field id="name" label="Your name" error={errors.name?.message}>
              <Input id="name" autoComplete="name" icon="person" placeholder="Nina Patel" {...register("name")} />
            </Field>

            <Field id="email" label="Email" hint="You'll sign in with this." error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" icon="alternate_email" placeholder="you@example.com" {...register("email")} />
            </Field>

            <Field id="password" label="Password" hint={`At least ${NEW_PASSWORD_MIN_LENGTH} characters.`} error={errors.password?.message}>
              <PasswordInput id="password" autoComplete="new-password" {...register("password")} />
            </Field>

            {invite.isError && (
              <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
                This invite is no longer valid. Ask for a new link, or remove it from the address to create your own organization.
              </p>
            )}

            {!inviteToken && (
              <Field
                id="organizationName"
                label="Organization"
                hint="Optional. You can create more organizations later."
                error={errors.organizationName?.message}
              >
                <Input
                  id="organizationName"
                  autoComplete="organization"
                  icon="apartment"
                  placeholder={name ? `${name}'s organization` : "Acme Studio"}
                  {...register("organizationName")}
                />
              </Field>
            )}

            {formError && (
              <div role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
                {formError}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-base w-full py-3">
              {isSubmitting ? (
                <Icon name="sync" size={18} className="animate-spin" />
              ) : (
                <>
                  Create account
                  <Icon name="arrow_forward" size={16} />
                </>
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-md text-center text-body-sm text-on-surface-variant">
          Already have an account?{" "}
          <Link
            to={routes.login}
            state={inviteToken ? { from: `${routes.invite(inviteToken)}?join=1` } : undefined}
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
        <p className="mt-sm text-center text-[11px] text-on-surface-variant/70">
          Sentinel is a portfolio project. Your email isn't verified or used for anything except signing in.
        </p>
      </motion.div>
    </div>
  );
}
