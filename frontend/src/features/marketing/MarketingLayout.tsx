import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/features/auth/useAuth";
import { routes } from "@/lib/routes";
import { GITHUB_URL } from "./plans";

/// Scrolls to "#section" links (also when arriving from another page), and
/// to the top on a plain page change.
function useScrollToHash(): void {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [pathname, hash]);
}

function Header() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-margin-mobile md:px-8">
        <Link to={routes.home} className="flex items-center gap-sm" aria-label="Sentinel home">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon name="security" size={18} />
          </span>
          <span className="text-body-md font-semibold tracking-tight text-on-surface">Sentinel</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 text-body-sm">
          <Link to={`${routes.home}#features`} className="hidden rounded-lg px-3 py-2 text-on-surface-variant hover:text-on-surface md:block">
            Features
          </Link>
          <Link to={`${routes.home}#security`} className="hidden rounded-lg px-3 py-2 text-on-surface-variant hover:text-on-surface md:block">
            Security
          </Link>
          <NavLink
            to={routes.pricing}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 ${isActive ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`
            }
          >
            Pricing
          </NavLink>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg px-3 py-2 text-on-surface-variant hover:text-on-surface sm:block"
          >
            GitHub
          </a>
          <ThemeToggle />
          {!isLoading &&
            (isAuthenticated ? (
              <Link
                to={routes.app}
                className="ml-1 rounded-lg bg-primary px-4 py-2 font-mono text-label-mono uppercase tracking-wider text-on-primary transition-colors hover:bg-primary/90"
              >
                Open console
              </Link>
            ) : (
              <>
                <Link to={routes.login} className="rounded-lg px-3 py-2 text-on-surface-variant hover:text-on-surface">
                  Sign in
                </Link>
                <Link
                  to={routes.signup}
                  className="ml-1 whitespace-nowrap rounded-lg bg-primary px-4 py-2 font-mono text-label-mono uppercase tracking-wider text-on-primary transition-colors hover:bg-primary/90"
                >
                  Sign up
                </Link>
              </>
            ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-outline-variant">
      <div className="mx-auto grid max-w-6xl gap-8 px-margin-mobile py-12 sm:grid-cols-3 md:px-8">
        <div className="flex flex-col gap-2">
          <span className="text-body-md font-semibold text-on-surface">Sentinel</span>
          <p className="text-body-sm text-on-surface-variant">
            Monitor and control your team's Windows laptops from anywhere.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-body-sm">
          <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface-variant">Product</span>
          <Link to={`${routes.home}#features`} className="text-on-surface-variant hover:text-on-surface">Features</Link>
          <Link to={`${routes.home}#security`} className="text-on-surface-variant hover:text-on-surface">Security</Link>
          <Link to={routes.pricing} className="text-on-surface-variant hover:text-on-surface">Pricing</Link>
        </div>
        <div className="flex flex-col gap-2 text-body-sm">
          <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface-variant">Project</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-on-surface-variant hover:text-on-surface">
            Source on GitHub
          </a>
          <a
            href={`${GITHUB_URL}/blob/main/docs/architecture/multi-tenant-core.md`}
            target="_blank"
            rel="noreferrer"
            className="text-on-surface-variant hover:text-on-surface"
          >
            Architecture
          </a>
        </div>
      </div>
      <p className="border-t border-outline-variant px-margin-mobile py-4 text-center text-body-sm text-on-surface-variant">
        Sentinel is a portfolio project. Pricing is illustrative and no payments are taken.
      </p>
    </footer>
  );
}

/// The public site's frame: header, page, footer.
export function MarketingLayout() {
  useScrollToHash();

  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
