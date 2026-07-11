export default function IntakeMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 text-xs font-medium text-slate-400">Benefy — new screening</span>
      </div>

      <div className="grid grid-cols-1 gap-0 sm:grid-cols-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:col-span-3 sm:border-b-0 sm:border-r">
          <div className="self-start rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Single mom, two kids, works part-time at a bakery, lives in the Mission. Worried
            about her PG&amp;E bill.
          </div>
          <div className="self-end rounded-2xl rounded-br-sm bg-teal-700 px-4 py-3 text-sm text-white">
            Got it — household of 3, part-time income. Checking CalFresh, PG&amp;E CARE, and SFMTA
            Lifeline against 2026 FPL thresholds…
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />
            Intake agent building structured profile
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 p-5 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Estimated annual value
          </p>
          <p className="text-3xl font-semibold text-emerald-700">$4,860</p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <span className="text-slate-700">CalFresh</span>
              <span className="font-medium text-emerald-700">Likely eligible</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <span className="text-slate-700">PG&amp;E CARE</span>
              <span className="font-medium text-emerald-700">Likely eligible</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="text-slate-700">SFMTA Lifeline</span>
              <span className="font-medium text-amber-700">Needs review</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
