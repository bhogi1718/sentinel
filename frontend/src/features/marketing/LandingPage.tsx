import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useTryDemo } from "@/features/auth/useTryDemo";
import { routes } from "@/lib/routes";
import { usePageMeta } from "@/lib/usePageMeta";
import { PlanCard } from "./PlanCard";
import { PLANS } from "./plans";
import { ProductPreview } from "./ProductPreview";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "memory",
    title: "Live status and metrics",
    body: "See which laptops are online, with CPU, memory, disk, battery and network readings as they happen.",
  },
  {
    icon: "cast",
    title: "Live screen view",
    body: "Watch a laptop's screen in near real time, view-only, and annotate a frame to explain what you see.",
  },
  {
    icon: "power_settings_new",
    title: "Remote commands",
    body: "Lock, restart, sleep, log off or shut down, and end a stuck process - each one recorded with who sent it.",
  },
  {
    icon: "folder",
    title: "Files and screenshots",
    body: "Browse and download files from the laptop, or capture its screen on demand.",
  },
  {
    icon: "notifications",
    title: "Alerts",
    body: "Boots, locks, sleep, network drops and low battery appear on a live timeline, and can be sent to Telegram.",
  },
  {
    icon: "group",
    title: "Organizations and roles",
    body: "Owners, Admins and Viewers. Viewers can look; acting on a device takes an Admin or Owner.",
  },
];

const STEPS: { title: string; body: string }[] = [
  { title: "Add a device", body: "Name the laptop in the console. You get its agent token once." },
  { title: "Install the agent", body: "Run the small Windows service with that token. It starts on boot and reconnects on its own." },
  { title: "Watch it come online", body: "Status, events and controls appear in the console within seconds." },
];

const SECURITY: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shield_person",
    title: "Isolated per organization",
    body: "Every route, realtime update and agent reply is scoped to one organization. A test suite against a real database proves one customer can't see or touch another's devices.",
  },
  {
    icon: "key",
    title: "Least privilege by role",
    body: "Viewers see status and history. Screen access, files and commands need an Admin, and the server enforces it on every request.",
  },
  {
    icon: "visibility",
    title: "Visible to the person at the laptop",
    body: "The live view is view-only, and by default an on-screen banner tells the person at the laptop while their screen is being viewed.",
  },
  {
    icon: "lock",
    title: "Credentials handled carefully",
    body: "Device tokens and refresh tokens are stored only as hashes, sessions can be revoked, and realtime connections are closed when their sign-in expires.",
  },
];

const FAQ: { question: string; answer: string }[] = [
  {
    question: "Can I try it without installing anything?",
    answer: "Yes. The live demo signs you into a sample organization with a simulated laptop - events, metrics, live view and commands all work.",
  },
  {
    question: "Which computers does the agent run on?",
    answer: "Windows 10 and 11. The agent is a small Rust program that runs as a Windows service.",
  },
  {
    question: "What does the person at the laptop see?",
    answer: "By default, an on-screen banner while their screen is being viewed. The live view can't click or type.",
  },
  {
    question: "How is my data kept separate from other customers'?",
    answer:
      "Everything belongs to an organization, and every request is checked against your membership in it. Requests for another organization's data are answered exactly as if it didn't exist.",
  },
  {
    question: "Can I host it myself?",
    answer: "Yes. The source is on GitHub, and it runs on the free tiers of Render, Vercel and Neon.",
  },
  {
    question: "What isn't built yet?",
    answer: "Self-service sign-up, team invites and billing. Accounts are created by the operator for now.",
  },
];

function Section({ id, eyebrow, title, intro, children }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-margin-mobile py-20 md:px-8">
      <div className="mb-10 flex max-w-2xl flex-col gap-3">
        <span className="font-mono text-label-mono uppercase tracking-[0.2em] text-primary">{eyebrow}</span>
        <h2 className="font-display text-3xl font-semibold leading-tight text-on-surface md:text-4xl">{title}</h2>
        {intro && <p className="text-body-lg text-on-surface-variant">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export function LandingPage() {
  usePageMeta(
    "Sentinel",
    "Monitor and control your team's Windows laptops from anywhere: live status, live screen view, remote commands and alerts, with every organization kept separate.",
  );
  const { isAuthenticated } = useAuth();
  const demo = useTryDemo();

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-margin-mobile py-16 md:grid-cols-2 md:px-8 md:py-24">
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-primary">
            Remote device monitoring
          </span>
          <h1 className="font-display text-4xl font-semibold leading-[1.1] text-on-surface md:text-5xl">
            Monitor and control your team's Windows laptops from anywhere.
          </h1>
          <p className="text-body-lg text-on-surface-variant">
            Live status, a live screen view, remote commands and instant alerts - with every organization's devices kept
            strictly to itself.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to={isAuthenticated ? routes.app : routes.signup}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-mono text-label-mono uppercase tracking-wider text-on-primary transition-colors hover:bg-primary/90"
            >
              {isAuthenticated ? "Open console" : "Get started free"}
              <Icon name="arrow_forward" size={16} />
            </Link>
            {demo.enabled && (
              <button
                type="button"
                onClick={() => void demo.start()}
                disabled={demo.starting}
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-5 py-3 font-mono text-label-mono uppercase tracking-wider text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-60"
              >
                <Icon name="play_arrow" size={18} />
                {demo.starting ? "Starting demo…" : "Try the live demo"}
              </button>
            )}
          </div>
          {demo.error && <p className="text-body-sm text-error">{demo.error}</p>}
          <p className="text-body-sm text-on-surface-variant">
            Free for up to two laptops.{demo.enabled && " Or try the demo first - no account needed, the laptop is simulated."}
          </p>
        </div>
        <ProductPreview />
      </section>

      <Section
        id="features"
        eyebrow="Features"
        title="Everything you need to look after a fleet of laptops"
        intro="One console for every device in your organization, with the right controls for each person's role."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={feature.icon} size={22} />
              </span>
              <h3 className="text-body-lg font-semibold text-on-surface">{feature.title}</h3>
              <p className="text-body-sm text-on-surface-variant">{feature.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="How it works" title="Up and running in three steps">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-6">
              <span className="font-mono text-2xl font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="text-body-lg font-semibold text-on-surface">{step.title}</h3>
              <p className="text-body-sm text-on-surface-variant">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="security"
        eyebrow="Security"
        title="Built so one customer can never reach another's devices"
        intro="Remote access is powerful, so the boundaries are enforced on the server and tested, not just hidden in the interface."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {SECURITY.map((item) => (
            <article key={item.title} className="flex gap-4 rounded-2xl border border-outline-variant bg-surface-container-low p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={item.icon} size={22} />
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-body-lg font-semibold text-on-surface">{item.title}</h3>
                <p className="text-body-sm text-on-surface-variant">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="Pricing" title="Start free, pay per device as you grow">
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
        <p className="mt-6 text-body-sm text-on-surface-variant">
          <Link to={routes.pricing} className="text-primary underline-offset-4 hover:underline">
            Compare plans in detail
          </Link>
        </p>
      </Section>

      <Section eyebrow="FAQ" title="Questions, answered">
        <div className="flex max-w-3xl flex-col divide-y divide-outline-variant rounded-2xl border border-outline-variant bg-surface-container-low">
          {FAQ.map((item) => (
            <details key={item.question} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body-md font-medium text-on-surface">
                {item.question}
                <Icon name="expand_more" size={20} className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-body-sm text-on-surface-variant">{item.answer}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
