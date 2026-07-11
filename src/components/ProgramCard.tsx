"use client";

import Link from "next/link";
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

interface Props {
  result: EligibilityResult;
  programName: string;
  clientId: string;
  onResolve?: () => void;
}

export default function ProgramCard({ result, programName, clientId, onResolve }: Props) {
  const style = STYLES[result.status];
  const [expanded, setExpanded] = useState(false);

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
          <Link
            href={`/clients/${clientId}/application/${result.program_id}`}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-800"
          >
            Generate application →
          </Link>
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
    </div>
  );
}
