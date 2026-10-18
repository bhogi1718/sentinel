import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface State {
  error: Error | null;
}

/// Last line of defence: a rendering error anywhere below shows a
/// recoverable page instead of a blank screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled rendering error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface px-6 text-center">
        <span className="font-mono text-label-mono uppercase tracking-[0.2em] text-error">Something went wrong</span>
        <h1 className="font-display text-3xl font-semibold text-on-surface">This page hit an unexpected error</h1>
        <p className="max-w-md text-body-md text-on-surface-variant">
          Reloading usually fixes it. If it keeps happening, the details are in the browser console.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-5 py-3 font-mono text-label-mono uppercase tracking-wider text-on-primary hover:bg-primary/90"
          >
            Reload
          </button>
          <a
            href="/"
            className="rounded-lg border border-outline-variant bg-surface-container px-5 py-3 font-mono text-label-mono uppercase tracking-wider text-on-surface hover:bg-surface-container-high"
          >
            Go home
          </a>
        </div>
      </div>
    );
  }
}
