import Image from "next/image";

export default function HeroCollage() {
  return (
    <div className="relative mx-auto h-[420px] w-full max-w-md sm:h-[480px] lg:h-[600px] lg:max-w-none">
      <div className="bg-dot-grid absolute -top-8 left-6 h-24 w-28 text-slate-300 opacity-80 sm:left-10" />

      <div className="absolute inset-x-4 inset-y-6 rounded-[42%_58%_70%_30%/45%_45%_55%_55%] bg-gradient-to-br from-teal-100 via-teal-50 to-white rotate-6 shadow-2xl" />

      <div className="absolute left-2 top-2 flex -rotate-6 items-center gap-2 sm:left-6 sm:top-4">
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md">
          Live product demo
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm leading-none text-white shadow-md">
          +
        </span>
      </div>

      <div className="absolute left-2 top-16 w-52 -rotate-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:left-8 sm:top-20 sm:w-60">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          <span className="ml-1 text-[10px] font-medium text-slate-400">New screening</span>
        </div>
        <p className="px-3 py-2.5 text-[11px] leading-snug text-slate-600">
          &ldquo;Single mom, two kids, works part-time at a bakery, lives in the Mission.&rdquo;
        </p>
      </div>

      <div className="absolute left-28 top-44 -rotate-12 rounded-md bg-teal-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg sm:left-36 sm:top-52">
        Try it live
      </div>

      <div className="absolute right-6 top-4 rotate-6 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-xl sm:right-10 sm:top-8">
        $4,860/yr found
      </div>

      <div className="absolute bottom-2 right-0 w-48 rotate-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:w-56 sm:right-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Estimated annual value
        </p>
        <p className="mt-1 text-2xl font-bold text-emerald-700">$4,860</p>
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between rounded-md bg-emerald-50 px-2 py-1 text-[11px]">
            <span className="text-slate-700">CalFresh</span>
            <span className="font-medium text-emerald-700">Eligible</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-emerald-50 px-2 py-1 text-[11px]">
            <span className="text-slate-700">PG&amp;E CARE</span>
            <span className="font-medium text-emerald-700">Eligible</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-amber-50 px-2 py-1 text-[11px]">
            <span className="text-slate-700">SFMTA Lifeline</span>
            <span className="font-medium text-amber-700">Review</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-16 left-0 -rotate-6 rounded-xl bg-white p-3 shadow-xl sm:bottom-20 sm:left-4">
        <p className="text-2xl font-bold text-teal-700">01</p>
        <Image
          src="/logos/calfresh.jpg"
          alt="CalFresh"
          width={64}
          height={24}
          className="mt-1 h-4 w-auto"
          unoptimized
        />
      </div>

      <div className="absolute -bottom-2 right-20 rotate-4 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xl sm:right-28">
        Explore programs →
      </div>

      <span className="absolute -bottom-3 -right-1 h-6 w-6 rounded-full bg-teal-400 shadow-md sm:right-2" />
    </div>
  );
}
