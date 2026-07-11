"use client";

import { useState } from "react";
import type { ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import ProgramCard from "@/components/ProgramCard";
import TraceView from "@/components/TraceView";

interface Props {
  clientId: string;
  screening: ScreeningResult;
  programs: ProgramDefinition[];
  explanation: string | null;
  citations: { program_id: string; source: string; url: string }[];
  mode: "live_gradient_agent" | "local_fallback" | null;
  trace: TraceStep[];
  onResolve: (programId: string) => void;
}

export default function ResultsView({
  clientId,
  screening,
  programs,
  explanation,
  citations,
  mode,
  trace,
  onResolve,
}: Props) {
  const [showTrace, setShowTrace] = useState(false);
  const programName = (id: string) => programs.find((p) => p.program_id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-8 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Estimated benefits surfaced</p>
        <p className="mt-2 text-5xl font-bold text-emerald-800">
          {formatMoney(screening.total_estimated_annual_value)}
          <span className="text-xl font-medium text-emerald-600"> / year</span>
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          {formatMoney(screening.total_estimated_monthly_value)} / month · {screening.eligible_count} likely-eligible
          program(s)
        </p>
        {screening.needs_review_count > 0 && (
          <p className="mt-3 text-xs text-amber-700">
            +{formatMoney(screening.potential_additional_value)}/year potential if {screening.needs_review_count}{" "}
            needs-review item(s) are confirmed eligible — excluded from the total above until verified.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {screening.results.map((r) => (
          <ProgramCard
            key={r.program_id}
            result={r}
            programName={programName(r.program_id)}
            clientId={clientId}
            onResolve={r.status === "needs_review" ? () => onResolve(r.program_id) : undefined}
          />
        ))}
      </div>

      {explanation && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Navigator explanation</h3>
            {mode && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {mode === "live_gradient_agent" ? "Live Gradient agent" : "Local fallback (no Gradient credentials configured)"}
              </span>
            )}
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{explanation}</div>
          {citations.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-500">Sources</p>
              <ul className="mt-1 space-y-1">
                {citations.map((c) => (
                  <li key={c.program_id} className="text-xs text-slate-500">
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
                      {c.source}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          onClick={() => setShowTrace((v) => !v)}
          className="text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          {showTrace ? "Hide reasoning ▲" : "View reasoning (Gradient trace) ▼"}
        </button>
        {showTrace && (
          <div className="mt-4">
            <TraceView trace={trace} />
          </div>
        )}
      </div>
    </div>
  );
}
