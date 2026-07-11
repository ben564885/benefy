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
}

export default function ProgramCard({ result, programName, clientId }: Props) {
  const style = STYLES[result.status];
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
    <div className={`flex h-full flex-col rounded-xl border ${style.border} ${style.bg} p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold leading-snug text-slate-900">{programName}</h3>
        {result.status === "likely_eligible" && (
          <p className="whitespace-nowrap text-right font-display text-lg font-semibold text-emerald-700">
            {formatMoney(result.estimated_annual_value)}
            <span className="block text-[11px] font-normal text-emerald-600">estimated/year</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={toggleApply}
          className="rounded-lg border border-slate-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-400 hover:text-teal-800"
        >
          {applyOpen ? "Hide application" : "See application details"}
        </button>
      </div>

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
