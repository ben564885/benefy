"use client";

import { useState } from "react";
import type { ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import ApplyPanel from "@/components/ApplyPanel";
import ProgramCard from "@/components/ProgramCard";
import TraceView from "@/components/TraceView";

interface Props {
  clientId: string;
  screening: ScreeningResult;
  programs: ProgramDefinition[];
  explanation: string | null;
  explanationPending?: boolean;
  citations: { program_id: string; source: string; url: string }[];
  mode: "live_gradient_agent" | "live_inference" | "local_fallback" | null;
  trace: TraceStep[];
  lang?: Lang;
  onAsk?: (question: string) => Promise<string | null>;
  onResolve: (programId: string) => void;
  onRecheck?: () => void;
}

export default function ResultsCard({ clientId, screening, programs, trace, onRecheck }: Props) {
  const [showTrace, setShowTrace] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);
  const programName = (id: string) => programs.find((p) => p.program_id === id)?.name ?? id;

  const shownResults = [
    ...screening.results.filter((r) => r.status === "likely_eligible"),
    ...screening.results.filter((r) => r.status === "needs_review"),
  ];
  const ineligibleResults = screening.results.filter((r) => r.status === "likely_ineligible");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Estimated benefits surfaced</p>
        <p className="mt-1 text-4xl font-bold text-emerald-800">
          {formatMoney(screening.total_estimated_annual_value)}
          <span className="text-lg font-medium text-emerald-600"> / year</span>
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          {formatMoney(screening.total_estimated_monthly_value)} / month · {screening.eligible_count} likely-eligible
          program(s)
        </p>
        {screening.needs_review_count > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            +{formatMoney(screening.potential_additional_value)}/year potential if {screening.needs_review_count}{" "}
            needs-review item(s) are confirmed eligible.
          </p>
        )}
      </div>

      <div className="results-carousel -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3">
        {shownResults.map((r, i) => (
          <div
            key={r.program_id}
            className="animate-benefit-pop w-64 flex-shrink-0 snap-start"
            style={{ animationDelay: `${100 + i * 120}ms` }}
          >
            <ProgramCard
              result={r}
              programName={programName(r.program_id)}
              clientId={clientId}
            />
          </div>
        ))}
      </div>

      <ApplyPanel clientId={clientId} screening={screening} programs={programs} />

      {ineligibleResults.length > 0 && (
        <div>
          <button
            onClick={() => setShowIneligible((v) => !v)}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            {showIneligible
              ? "Hide programs you're likely not eligible for ▲"
              : `${ineligibleResults.length} program(s) screened likely not eligible — show ▼`}
          </button>
          {showIneligible && (
            <div className="results-carousel -mx-1 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3">
              {ineligibleResults.map((r) => (
                <div key={r.program_id} className="w-64 flex-shrink-0 snap-start">
                  <ProgramCard
                    result={r}
                    programName={programName(r.program_id)}
                    clientId={clientId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowTrace((v) => !v)}
          className="text-xs font-medium text-teal-700 hover:text-teal-900"
        >
          {showTrace ? "Hide reasoning ▲" : "View reasoning ▼"}
        </button>
        {onRecheck && screening.needs_review_count > 0 && (
          <button onClick={onRecheck} className="text-xs font-medium text-slate-500 hover:text-slate-700">
            Recheck eligibility ↻
          </button>
        )}
      </div>
      {showTrace && <TraceView trace={trace} />}
    </div>
  );
}
