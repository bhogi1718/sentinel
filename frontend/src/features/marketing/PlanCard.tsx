import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";
import { GITHUB_URL } from "./plans";
import type { Plan } from "./plans";

const CTA_CLASS =
  "mt-auto inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-mono text-label-mono uppercase tracking-wider transition-colors disabled:opacity-60";

export function PlanCard({ plan }: { plan: Plan }) {
  const ctaStyle = plan.featured
    ? "bg-primary text-on-primary hover:bg-primary/90"
    : "border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high";

  return (
    <article
      className={`relative flex flex-col gap-5 rounded-2xl border p-6 ${
        plan.featured ? "border-primary/60 bg-surface-container shadow-lg" : "border-outline-variant bg-surface-container-low"
      }`}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 font-mono text-[10px] uppercase tracking-wider text-on-primary">
          Most popular
        </span>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-body-lg font-semibold text-on-surface">{plan.name}</h3>
        <p className="text-body-sm text-on-surface-variant">{plan.tagline}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold text-on-surface">{plan.price}</span>
        <span className="text-body-sm text-on-surface-variant">{plan.priceNote}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="flex items-start gap-2 text-body-sm text-on-surface">
            <Icon name="check" size={18} className="mt-px shrink-0 text-primary" />
            {highlight}
          </li>
        ))}
      </ul>
      {plan.cta === "contact" ? (
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`${CTA_CLASS} ${ctaStyle}`}>
          Get in touch
        </a>
      ) : (
        <Link to={routes.signup} className={`${CTA_CLASS} ${ctaStyle}`}>
          Get started free
          <Icon name="arrow_forward" size={16} />
        </Link>
      )}
    </article>
  );
}
