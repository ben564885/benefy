"use client";

import { useState } from "react";
import type { ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import AgentMarkdown from "@/components/AgentMarkdown";
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
  onResolve: (programId: string) => void;
  onRecheck?: () => void;
}

export default function ResultsCard({
  clientId,
  screening,
  programs,
  explanation,
  explanationPending,
  citations,
  mode,
  trace,
  onResolve,
  onRecheck,
}: Props) {
  const [showTrace, setShowTrace] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);
  const programName = (id: string) => programs.find((p) => p.program_id === id)?.name ?? id;

  // Only surface programs worth the user's attention — wins first, then the
  // ones a quick answer could unlock. Likely-ineligible results stay out of
  // the reveal entirely, behind the disclosure toggle below.
  const shownResults = [
    ...screening.results.filter((r) => r.status === "likely_eligible"),
    ...screening.results.filter((r) => r.status === "needs_review"),
  ];
  const ineligibleResults = screening.results.filter((r) => r.status === "likely_ineligible");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 p-6 text-center">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shownResults.map((r, i) => (
          <div
            key={r.program_id}
            className="animate-benefit-pop h-full"
            style={{ animationDelay: `${100 + i * 120}ms` }}
          >
            <ProgramCard
              result={r}
              programName={programName(r.program_id)}
              clientId={clientId}
              onResolve={r.status === "needs_review" ? () => onResolve(r.program_id) : undefined}
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
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ineligibleResults.map((r) => (
                <ProgramCard
                  key={r.program_id}
                  result={r}
                  programName={programName(r.program_id)}
                  clientId={clientId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!explanation && explanationPending && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <p className="animate-pulse text-sm text-slate-400">Writing your plain-language explanation…</p>
        </div>
      )}

      {explanation && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm text-slate-700">
            <AgentMarkdown>{explanation}</AgentMarkdown>
          </div>
          {mode && (
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] ${
                mode === "local_fallback" ? "bg-slate-200 text-slate-500" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {mode === "live_gradient_agent"
                ? "Live Gradient Agent Platform"
                : mode === "live_inference"
                  ? "Live DigitalOcean Inference"
                  : "Local fallback"}
            </span>
          )}
          {citations.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {citations.map((c) => (
                <li key={c.program_id} className="text-xs text-slate-500">
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
                    {c.source}
                  </a>
                </li>
              ))}
            </ul>
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
