export default function IntakeMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col gap-6 p-6 sm:flex-row">
        <div className="flex flex-col gap-3 sm:w-3/5">
          <div className="self-start rounded-2xl rounded-bl-sm bg-white/15 px-4 py-3 text-sm text-white">
            I&apos;m a single mom with two kids, work part-time at a bakery, and live in the
            Mission. Worried about my PG&amp;E bill.
          </div>
          <div className="self-end rounded-2xl rounded-br-sm bg-teal-600/90 px-4 py-3 text-sm text-white">
            Got it — household of 3, part-time income. Checking CalFresh, PG&amp;E CARE, and SFMTA
            Lifeline against 2026 FPL thresholds…
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3 sm:w-2/5 sm:border-l sm:border-white/15 sm:pl-6">
          <p className="text-xs font-bold uppercase tracking-wide text-white/60">
            Estimated annual value
          </p>
          <p className="text-3xl font-bold text-white">$4,860</p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
              <span className="font-bold text-white">CalFresh</span>
              <span className="text-xs font-bold text-emerald-300">Likely eligible</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
              <span className="font-bold text-white">PG&amp;E CARE</span>
              <span className="text-xs font-bold text-emerald-300">Likely eligible</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
              <span className="font-bold text-white">SFMTA Lifeline</span>
              <span className="text-xs font-bold text-amber-300">Needs review</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
