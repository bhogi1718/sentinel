import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";

/// Shared UI primitives for the "Command Deck" design language. Hairline
/// borders over heavy shadows; gold reserved for active/primary; mono for
/// data and labels. Replaces the ad-hoc Tailwind repeated across pages.

type Tone = "default" | "primary" | "success" | "warning" | "danger";

const toneText: Record<Tone, string> = {
  default: "text-on-surface-variant",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-error",
};

const toneDot: Record<Tone, string> = {
  default: "bg-outline",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-error",
};

/// A hairline-bordered surface. The base building block for everything.
export function Card({
  children,
  className = "",
  as: As = "div",
  interactive = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  interactive?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={`rounded-xl border border-outline-variant bg-surface-container-low ${
        interactive ? "transition-colors hover:border-outline hover:bg-surface-container" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

/// Small uppercase mono section label with an optional trailing control.
export function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-xs">
      <span className="font-mono text-label-mono uppercase tracking-widest text-on-surface-variant">{children}</span>
      {trailing}
    </div>
  );
}

/// A status pill: a coloured dot plus a short mono label.
export function StatusPill({ tone = "default", label, pulse = false }: { tone?: Tone; label: string; pulse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-xs rounded-full border border-outline-variant bg-surface-container px-base py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]} ${pulse ? "animate-pulse" : ""}`} />
      <span className={`font-mono text-[10px] uppercase tracking-wider ${toneText[tone]}`}>{label}</span>
    </span>
  );
}

/// A labelled metric. `value` is the figure (mono), with an optional unit
/// and a thin progress bar when `percent` is provided.
export function StatTile({
  label,
  value,
  unit,
  percent,
  tone = "primary",
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  percent?: number | null;
  tone?: Tone;
  icon?: IconName;
}) {
  const hasBar = percent !== undefined && percent !== null && !Number.isNaN(percent);
  const clamped = hasBar ? Math.min(100, Math.max(0, percent)) : 0;
  const barColor = tone === "primary" ? "bg-primary" : tone === "danger" ? "bg-error" : tone === "warning" ? "bg-warning" : "bg-success";

  return (
    <Card className="flex flex-col gap-sm p-md">
      <div className="flex items-center justify-between">
        <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface-variant">{label}</span>
        {icon && <Icon name={icon} size={16} className="text-on-surface-variant/60" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold text-on-surface">{value}</span>
        {unit && <span className="font-mono text-label-mono text-on-surface-variant">{unit}</span>}
      </div>
      {hasBar && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
          <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${clamped}%` }} />
        </div>
      )}
    </Card>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonVariant: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary/90",
  secondary: "border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high",
  ghost: "text-on-surface-variant hover:bg-white/5 hover:text-on-surface",
  danger: "border border-error/30 bg-error/10 text-error hover:bg-error/20",
};

export function Button({
  children,
  variant = "secondary",
  icon,
  className = "",
  ...rest
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  icon?: IconName;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-xs rounded-lg px-md py-2.5 font-mono text-label-mono uppercase tracking-wider transition-colors active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${buttonVariant[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/// The consistent spine at the top of every page: a title, an optional
/// one-line descriptor, and an optional right-aligned slot (status or a
/// primary action).
export function PageHeader({
  title,
  subtitle,
  icon,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-md">
      <div className="flex items-center gap-sm">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name={icon} size={22} />
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <h1 className="text-headline-lg-mobile font-semibold leading-none text-on-surface">{title}</h1>
          {subtitle && <span className="text-body-sm text-on-surface-variant">{subtitle}</span>}
        </div>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/// A text input with an optional leading icon, styled for the console.
export function Input({
  icon,
  className = "",
  ...rest
}: { icon?: IconName } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
          <Icon name={icon} size={18} />
        </span>
      )}
      <input
        className={`w-full rounded-lg border border-outline-variant bg-surface-container py-2.5 text-body-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:ring-1 focus:ring-primary/30 ${
          icon ? "pl-10 pr-3" : "px-3"
        } ${className}`}
        {...rest}
      />
    </div>
  );
}

/// A segmented control for a small set of mutually exclusive options.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex gap-0.5 rounded-lg border border-outline-variant bg-surface-container p-0.5 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-sm py-1.5 font-mono text-label-mono uppercase tracking-wider transition-colors ${
            value === opt.value ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/// A centred placeholder for empty / loading / error states.
export function StateBlock({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-sm px-md py-12 text-center">
      <Icon name={icon} size={30} className="text-on-surface-variant/60" />
      <span className="text-body-md text-on-surface">{title}</span>
      {children && <div className="text-body-sm text-on-surface-variant">{children}</div>}
    </Card>
  );
}
