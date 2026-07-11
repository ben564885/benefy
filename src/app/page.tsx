import Link from "next/link";
import MarqueeRow from "@/components/landing/MarqueeRow";
import IntakeMockup from "@/components/landing/IntakeMockup";
import StartScreeningButton from "@/components/StartScreeningButton";

const ROW_ONE = [
  "CalFresh",
  "PG&E CARE",
  "SFMTA Lifeline",
  "Deterministic eligibility engine",
  "Gradient AI intake agent",
  "Human-in-the-loop review",
];

const ROW_TWO = [
  "Pre-filled applications",
  "2026 FPL & AMI tables",
  "Navigator agent",
  "Guardrails on every response",
  "Full eligibility trace",
  "Zero guesswork",
];

const STEPS = [
  {
    title: "Tell us about yourself",
    body: "Type what's true about your household in plain English — no forms, no dropdowns, no waiting room.",
  },
  {
    title: "Agent builds your profile",
    body: "The Gradient AI intake agent extracts your household size, income, and situation into a structured profile.",
  },
  {
    title: "Engine screens, not the AI",
    body: "A tested, deterministic rules engine checks your profile against real SF/CA program thresholds — the model never decides eligibility.",
  },
  {
    title: "Dollars and next steps",
    body: "Get an annual dollar estimate, anything flagged for human review, and a pre-filled application ready to submit.",
  },
];

const STATS = [
  { value: "3", label: "SF/CA benefit programs screened" },
  { value: "12", label: "Deterministic engine test cases" },
  { value: "0", label: "Eligibility calls made by the AI" },
];

export default function HomePage() {
  return (
    <main className="flex-1 bg-white text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-sm font-bold text-white">
            B
          </span>
          Benefy
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#how-it-works" className="hover:text-slate-900">
            How it works
          </a>
          <a href="#trust" className="hover:text-slate-900">
            Trust &amp; guardrails
          </a>
          <a href="#programs" className="hover:text-slate-900">
            Programs
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <StartScreeningButton
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800"
          />
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-16 pb-20 text-center sm:pt-20">
        <div className="mb-8 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          <span className="h-px w-8 bg-slate-300" />
          Built for San Francisco residents
          <span className="h-px w-8 bg-slate-300" />
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
          Find every dollar
          <br />
          <span className="text-teal-700">you qualify for.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base text-slate-500 sm:text-lg">
          Tell us about your household in plain English. Benefy&apos;s intake agent builds your
          profile, a deterministic rules engine screens it against real SF benefit programs, and
          you get a dollar estimate plus a pre-filled application — in minutes, not hours.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <StartScreeningButton
            className="rounded-full bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          />
          <a
            href="#how-it-works"
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            See how it works
          </a>
        </div>
      </section>

      <section id="programs" className="flex flex-col gap-3 pb-16">
        <MarqueeRow items={ROW_ONE} direction="left" />
        <MarqueeRow items={ROW_TWO} direction="right" />
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <IntakeMockup />
      </section>

      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50 py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-teal-700">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
              From a sentence to a screened case
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="py-24">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-teal-700">
              Trust &amp; guardrails
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
              The AI never decides eligibility.
            </h2>
            <p className="mt-4 text-base text-slate-500">
              A pure, unit-tested rules engine is the only code path that ever returns
              likely-eligible, likely-ineligible, or needs-review. The agent gathers information
              and explains results — the yes/no always comes from the function call, never the
              model.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {[
              {
                title: "Deterministic engine",
                body: "Same input always yields the same output, checked against real 2026 program thresholds.",
              },
              {
                title: "Human-in-the-loop review",
                body: "Uncertain cases are flagged for review, never auto-approved.",
              },
              {
                title: "Full reasoning trace",
                body: "Every screening keeps a \"view reasoning\" trace so decisions stay auditable.",
              },
              {
                title: "Guarantee-language guardrails",
                body: "Agent output is checked for over-promising phrasing before you ever see it.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 px-6 text-center sm:grid-cols-3">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-semibold text-teal-700">{stat.value}</p>
              <p className="mt-2 text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 rounded-2xl bg-teal-700 px-8 py-16 text-center">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">
            See what you qualify for.
          </h2>
          <p className="max-w-xl text-teal-50">
            No account, no auth, no personal data required to try the full demo.
          </p>
          <StartScreeningButton
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50"
          />
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-400 sm:flex-row">
          <span>© 2026 Benefy. Built for San Francisco residents.</span>
          <span>Powered by DigitalOcean Gradient AI</span>
        </div>
      </footer>
    </main>
  );
}
