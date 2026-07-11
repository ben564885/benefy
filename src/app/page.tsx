import Image from "next/image";
import Link from "next/link";
import ProgramLogos from "@/components/landing/ProgramLogos";
import AnimatedStat from "@/components/landing/AnimatedStat";
import HowItWorksSteps from "@/components/landing/HowItWorksSteps";
import StartScreeningButton from "@/components/StartScreeningButton";

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
  { value: "62,000", label: "People in SF & Marin eligible for CalFresh who don't use it" },
  { value: "$3.5B", label: "In food assistance funding wasted each year" },
  { value: "49%", label: "Of eligible seniors don't get their SSI benefits" },
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
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center">
            <Image src="/logo_benefy.png" alt="Benefy" width={546} height={222} className="h-7 w-auto brightness-0 invert" priority />
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-bold text-white md:flex">
            <a href="#how-it-works" className="hover:text-white/70">
              How it works
            </a>
          </nav>
        </div>

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

          <ProgramLogos />
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

          <HowItWorksSteps steps={STEPS} />
        </div>
      </section>

      <section className="border-t border-white/20 py-16 backdrop-blur-sm">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 px-6 text-center sm:grid-cols-3">
          {STATS.map((stat) => (
            <AnimatedStat key={stat.label} value={stat.value} label={stat.label} />
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
