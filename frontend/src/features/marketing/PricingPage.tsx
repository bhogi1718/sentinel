import { Icon } from "@/components/ui/Icon";
import { usePageMeta } from "@/lib/usePageMeta";
import { PlanCard } from "./PlanCard";
import { COMPARISON, PLANS } from "./plans";

const PRICING_FAQ: { question: string; answer: string }[] = [
  {
    question: "What counts as a device?",
    answer: "Each laptop running the Sentinel agent. Members of your organization are not charged for.",
  },
  {
    question: "Can I change plans later?",
    answer: "Yes - plans are per organization, and moving between them keeps all of your devices and history.",
  },
  {
    question: "Is there a free trial?",
    answer: "The Free plan has no time limit, and the live demo lets you try every feature without an account.",
  },
  {
    question: "Can I actually buy a plan today?",
    answer: "Not yet. Sentinel is a portfolio project: these prices are illustrative and billing isn't built, so no payment is ever taken.",
  },
];

function Cell({ value }: { value: string }) {
  if (value === "Yes") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Icon name="check" size={18} />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  return <span className="text-on-surface">{value}</span>;
}

export function PricingPage() {
  usePageMeta(
    "Pricing",
    "Sentinel plans: Free for up to two devices, Team at $6 per device per month, and Business for custom needs.",
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-margin-mobile py-16 md:px-8">
      <header className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="font-mono text-label-mono uppercase tracking-[0.2em] text-primary">Pricing</span>
        <h1 className="font-display text-4xl font-semibold leading-tight text-on-surface md:text-5xl">
          Simple pricing, per device
        </h1>
        <p className="text-body-lg text-on-surface-variant">
          Start free with two laptops. Add your team and as many devices as you need when you're ready.
        </p>
        <p className="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 text-body-sm text-on-surface-variant">
          Sentinel is a portfolio project: prices are illustrative and no payments are taken.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <section aria-labelledby="compare-heading" className="flex flex-col gap-6">
        <h2 id="compare-heading" className="font-display text-3xl font-semibold text-on-surface">
          Compare plans
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-outline-variant">
          <table className="w-full min-w-[560px] text-left text-body-sm">
            <thead className="bg-surface-container-low">
              <tr>
                <th scope="col" className="px-4 py-3 font-mono text-label-mono uppercase tracking-wider text-on-surface-variant">
                  Feature
                </th>
                {PLANS.map((plan) => (
                  <th key={plan.id} scope="col" className="px-4 py-3 font-semibold text-on-surface">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="px-4 py-3 font-normal text-on-surface-variant">
                    {row.feature}
                  </th>
                  {row.values.map((value, index) => (
                    <td key={PLANS[index].id} className="px-4 py-3">
                      <Cell value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pricing-faq-heading" className="flex flex-col gap-6">
        <h2 id="pricing-faq-heading" className="font-display text-3xl font-semibold text-on-surface">
          Pricing questions
        </h2>
        <div className="flex max-w-3xl flex-col divide-y divide-outline-variant rounded-2xl border border-outline-variant bg-surface-container-low">
          {PRICING_FAQ.map((item) => (
            <details key={item.question} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body-md font-medium text-on-surface">
                {item.question}
                <Icon name="expand_more" size={20} className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-body-sm text-on-surface-variant">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
