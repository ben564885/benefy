import type { TraceStep } from "@/lib/types";

const ACTOR_LABEL: Record<TraceStep["actor"], string> = {
  router: "Router",
  intake_agent: "Intake Agent",
  function: "check_eligibility (function)",
  navigator_agent: "Navigator Agent",
};

const ACTOR_COLOR: Record<TraceStep["actor"], string> = {
  router: "bg-slate-100 text-slate-700",
  intake_agent: "bg-sky-100 text-sky-800",
  function: "bg-violet-100 text-violet-800",
  navigator_agent: "bg-emerald-100 text-emerald-800",
};

export default function TraceView({ trace }: { trace: TraceStep[] }) {
  if (trace.length === 0) {
    return <p className="text-sm text-slate-400">No trace recorded yet for this client.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {trace.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
            {i + 1}
          </span>
          <div>
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${ACTOR_COLOR[step.actor]}`}>
              {ACTOR_LABEL[step.actor]}
            </span>
            <p className="mt-1 text-slate-700">{step.detail}</p>
            <p className="text-xs text-slate-400">{new Date(step.timestamp).toLocaleTimeString()}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
