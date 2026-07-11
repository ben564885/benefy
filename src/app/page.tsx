import Image from "next/image";
import Link from "next/link";
import IntakeMockup from "@/components/landing/IntakeMockup";
import StartScreeningButton from "@/components/StartScreeningButton";

const PROGRAM_TABLE = [
  {
    name: "CalFresh",
    logo: { src: "/logos/calfresh.jpg", alt: "CalFresh" },
    description: "Monthly grocery assistance based on household size and income.",
    highlight: true,
  },
  {
    name: "PG&E CARE",
    logo: { src: "/logos/pge.svg", alt: "PG&E" },
    description: "A discounted rate on your monthly gas and electric bill.",
  },
  {
    name: "SFMTA Lifeline",
    logo: { src: "/logos/muni.svg", alt: "SFMTA Muni" },
    description: "Reduced-fare Muni passes for qualifying San Francisco residents.",
  },
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
    <main className="relative flex-1 text-white">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 -z-20 h-full w-full object-cover"
      >
        <source src="/bggg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 -z-10 bg-black/55" />
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center">
          <Image src="/logo_benefy.png" alt="Benefy" width={546} height={222} className="h-7 w-auto brightness-0 invert" priority />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-bold text-white md:flex">
          <a href="#how-it-works" className="hover:text-white/70">
            How it works
          </a>
          <a href="#trust" className="hover:text-white/70">
            Trust &amp; guardrails
          </a>
          <a href="#programs" className="hover:text-white/70">
            Programs
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <StartScreeningButton
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
          />
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pt-8 pb-20 sm:pt-12">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-wide text-white">
              Built for San Francisco residents
            </p>

            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
              Find every dollar you qualify for.
            </h1>

            <p className="mt-6 max-w-md text-base font-bold text-white sm:text-lg">
              Tell us about your household in plain English. Benefy&apos;s intake agent builds
              your profile, a deterministic rules engine screens it against real SF benefit
              programs, and you get a dollar estimate plus a pre-filled application — in minutes,
              not hours.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <StartScreeningButton
                className="rounded-lg bg-teal-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
              />
              <a
                href="#how-it-works"
                className="rounded-lg border border-white/40 px-6 py-3 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
          </div>

          <IntakeMockup />
        </div>
      </section>

      <section id="programs" className="mx-auto w-full max-w-4xl px-6 pb-24">
        <div className="mb-10 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-white">Programs</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Tailored to your household
          </h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 shadow-sm">
          {PROGRAM_TABLE.map((program, i) => (
            <div
              key={program.name}
              className={`flex flex-col items-start gap-4 px-6 py-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between ${
                i > 0 ? "border-t border-white/20" : ""
              } ${program.highlight ? "bg-amber-400/20" : "bg-white/10"}`}
            >
              <div className="flex items-center gap-3 sm:w-40 sm:shrink-0">
                <Image
                  src={program.logo.src}
                  alt={program.logo.alt}
                  width={40}
                  height={16}
                  className="h-4 w-auto"
                  unoptimized
                />
                <span className="font-bold text-white">{program.name}</span>
              </div>
              <p className="flex-1 text-sm font-bold text-white">{program.description}</p>
              <StartScreeningButton
                label="Check eligibility →"
                className="shrink-0 rounded-full border border-white px-4 py-1.5 text-xs font-bold text-white transition hover:bg-white hover:text-teal-800"
              />
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-white/20 py-24 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-white">How it works</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              From a sentence to a screened case
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border border-white/20 bg-white/10 p-6 shadow-sm backdrop-blur-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-base font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm font-bold text-white">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="py-24">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white">
              Trust &amp; guardrails
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              The AI never decides eligibility.
            </h2>
            <p className="mt-4 text-base font-bold text-white">
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
              <div
                key={item.title}
                className="flex gap-4 rounded-xl border border-white/20 bg-white/10 p-5 shadow-sm backdrop-blur-sm"
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-white" />
                <div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm font-bold text-white">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/20 py-16 backdrop-blur-sm">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 px-6 text-center sm:grid-cols-3">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-bold text-white">{stat.value}</p>
              <p className="mt-2 text-sm font-bold text-white">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 rounded-2xl bg-teal-700 px-8 py-16 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to find every
              <br />
              dollar you&apos;re owed?
            </h2>
            <p className="mt-3 max-w-md font-bold text-white">
              No account, no auth, no personal data required to try the full demo.
            </p>
          </div>

          <StartScreeningButton
            label="Check what I qualify for"
            className="shrink-0 rounded-lg bg-white px-6 py-3 text-sm font-bold text-teal-800 transition hover:bg-teal-50"
          />
        </div>
      </section>

      <footer className="border-t border-white/20 py-10 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm font-bold text-white sm:flex-row">
          <span>© 2026 Benefy. Built for San Francisco residents.</span>
          <span>Powered by DigitalOcean Gradient AI</span>
        </div>
      </footer>
    </main>
  );
}
