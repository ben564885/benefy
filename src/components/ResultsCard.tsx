"use client";

import { useState } from "react";
import type { ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { INTAKE_STRINGS, type Lang } from "@/lib/i18n";
import LinkifiedText from "@/components/LinkifiedText";
import ProgramCard from "@/components/ProgramCard";
import TraceView from "@/components/TraceView";

interface FollowUp {
  question: string;
  answer: string;
}

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

export default function ResultsCard({
  clientId,
  screening,
  programs,
  explanation,
  explanationPending,
  citations,
  mode,
  trace,
  lang = "en",
  onAsk,
  onResolve,
  onRecheck,
}: Props) {
  const [showTrace, setShowTrace] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const t = INTAKE_STRINGS[lang];
  const programName = (id: string) => programs.find((p) => p.program_id === id)?.name ?? id;
  const uniqueSources = [...new Map(citations.map((c) => [c.source, c])).values()];
  const explanationParagraphs = explanation?.split(/\n\n+/).filter(Boolean) ?? [];

  async function submitQuestion(text: string) {
    if (!text.trim() || !onAsk || asking) return;
    const question = text.trim();
    setDraft("");
    setAsking(true);
    setFollowUps((prev) => [...prev, { question, answer: "" }]);
    try {
      const answer = await onAsk(question);
      setFollowUps((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.question === question) {
          next[next.length - 1] = {
            question,
            answer: answer?.trim() || "Sorry, I couldn't answer that right now. Please try again.",
          };
        }
        return next;
      });
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
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

      {!explanation && explanationPending && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="animate-pulse text-sm text-slate-400">Writing your plain-language explanation…</p>
        </div>
      )}

      {explanation && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
              ✓
            </span>
            <h3 className="text-sm font-semibold text-slate-900">Quick summary</h3>
          </div>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {explanationParagraphs.map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-700">
                <LinkifiedText
                  text={paragraph}
                  linkClassName="text-teal-700 underline underline-offset-2 hover:text-teal-900"
                />
              </p>
            ))}
          </div>
          {uniqueSources.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowSources((v) => !v)}
                className="text-xs font-medium text-teal-700 hover:text-teal-900"
              >
                {showSources ? "Hide sources ▲" : `View sources (${uniqueSources.length}) ▼`}
              </button>
              {showSources && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {uniqueSources.map((c) => (
                    <li key={c.source} className="text-xs text-slate-500">
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
                        {c.source}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {mode && mode !== "local_fallback" && (
            <p className="mt-3 text-[11px] text-slate-400">
              {mode === "live_gradient_agent" ? "Powered by Gradient Agent Platform" : "Powered by DigitalOcean Inference"}
            </p>
          )}
        </section>
      )}

      {onAsk && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t.summaryAskLabel}</h3>
            <p className="mt-1 text-xs text-slate-500">{t.summaryAskHint}</p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {t.summarySuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={asking}
                onClick={() => submitQuestion(suggestion)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {followUps.length > 0 && (
            <div className="mt-4 max-h-72 space-y-3 overflow-y-auto border-t border-slate-100 pt-4">
              {followUps.map((item, i) => (
                <article key={i} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t.youAsked}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-800">{item.question}</p>
                  </div>
                  <div className="px-3 py-3 text-sm leading-relaxed text-slate-700">
                    {item.answer ? (
                      <LinkifiedText
                        text={item.answer}
                        linkClassName="text-teal-700 underline underline-offset-2 hover:text-teal-900"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-2 text-slate-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />
                        {t.thinking}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <form
            className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitQuestion(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={asking}
              placeholder={t.summaryAskPlaceholder}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-teal-400 focus:bg-white disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={asking || !draft.trim()}
              className="shrink-0 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-40"
            >
              {t.send}
            </button>
          </form>
        </section>
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
