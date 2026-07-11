"use client";

import { useState } from "react";
import type { EligibilityResult } from "@/lib/types";
import { formatMoney } from "@/lib/format";

const STYLES: Record<
  EligibilityResult["status"],
  { border: string; bg: string; badge: string; label: string }
> = {
  likely_eligible: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    badge: "bg-emerald-600 text-white",
    label: "Likely eligible",
  },
  likely_ineligible: {
    border: "border-slate-200",
    bg: "bg-slate-50",
    badge: "bg-slate-400 text-white",
    label: "Likely not eligible",
  },
  needs_review: {
    border: "border-amber-300",
    bg: "bg-amber-50",
    badge: "bg-amber-500 text-white",
    label: "Needs review",
  },
};

interface PrefillField {
  form_field: string;
  profile_key: string;
  value: string;
}

interface PrefillData {
  form_name: string;
  form_url: string;
  required_documents: string[];
  fields: PrefillField[];
}

interface Props {
  result: EligibilityResult;
  programName: string;
  clientId: string;
  onResolve?: () => void;
}

export default function ProgramCard({ result, programName, clientId, onResolve }: Props) {
  const style = STYLES[result.status];
  const [expanded, setExpanded] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillData | null>(null);
  const [loadingPrefill, setLoadingPrefill] = useState(false);

  async function toggleApply() {
    if (applyOpen) {
      setApplyOpen(false);
      return;
    }
    setApplyOpen(true);
    if (prefill) return;
    setLoadingPrefill(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/application/${result.program_id}`);
      const data = await res.json();
      if (res.ok) setPrefill(data);
    } finally {
      setLoadingPrefill(false);
    }
  }

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{programName}</h3>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}>
            {style.label}
          </span>
        </div>
        {result.status === "likely_eligible" && (
          <p className="whitespace-nowrap text-right text-lg font-semibold text-emerald-700">
            {formatMoney(result.estimated_annual_value)}
            <span className="block text-xs font-normal text-emerald-600">estimated/year</span>
          </p>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-700">{result.reason}</p>

      {result.missing_fields.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">Missing: {result.missing_fields.join(", ")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {result.status === "likely_eligible" && (
          <button
            onClick={toggleApply}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-800"
          >
            {applyOpen ? "Hide application" : "See application details"}
          </button>
        )}
        {result.status === "needs_review" && onResolve && (
          <button
            onClick={onResolve}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
          >
            Resolve →
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {expanded ? "Hide details" : "Details"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500">
          <p>Confidence: {Math.round(result.confidence * 100)}%</p>
          {result.income_pct_fpl != null && <p>Income basis: {result.income_pct_fpl}% of the program&apos;s income limit</p>}
          {result.review_triggers.length > 0 && <p>Review trigger(s): {result.review_triggers.join(", ")}</p>}
        </div>
      )}

      {applyOpen && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          {loadingPrefill && <p className="text-xs text-slate-400">Loading your pre-filled application…</p>}
          {prefill && (
            <>
              <p className="text-xs font-semibold text-slate-900">{prefill.form_name} — pre-filled draft</p>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {prefill.fields.map((f) => (
                  <div key={f.form_field} className="rounded-md bg-slate-50 p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{f.form_field}</dt>
                    <dd className="mt-0.5 text-xs font-medium text-slate-900">
                      {f.value || <span className="text-slate-400">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              {prefill.required_documents.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  You&apos;ll need: {prefill.required_documents.join(", ")}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <a
                  href={prefill.form_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  Official application ↗
                </a>
                <a
                  href={`/clients/${clientId}/application/${result.program_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Open printable version ↗
                </a>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Draft pre-fill only — review and submit through the official channel above.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
