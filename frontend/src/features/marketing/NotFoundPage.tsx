import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { routes } from "@/lib/routes";
import { usePageMeta } from "@/lib/usePageMeta";

export function NotFoundPage() {
  usePageMeta("Page not found", "This page doesn't exist.");
  const { isAuthenticated } = useAuth();

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-margin-mobile py-24 text-center">
      <span className="font-mono text-label-mono uppercase tracking-[0.2em] text-primary">404</span>
      <h1 className="font-display text-4xl font-semibold text-on-surface">This page doesn't exist</h1>
      <p className="text-body-lg text-on-surface-variant">The link may be old, or the address may have a typo.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to={routes.home}
          className="rounded-lg border border-outline-variant bg-surface-container px-5 py-3 font-mono text-label-mono uppercase tracking-wider text-on-surface hover:bg-surface-container-high"
        >
          Go home
        </Link>
        {isAuthenticated && (
          <Link
            to={routes.app}
            className="rounded-lg bg-primary px-5 py-3 font-mono text-label-mono uppercase tracking-wider text-on-primary hover:bg-primary/90"
          >
            Open console
          </Link>
        )}
      </div>
    </div>
  );
}
