"use client";

import { useEffect, useState } from "react";
import type { ApplicationProfile, ProgramDefinition, ScreeningResult, Submission } from "@/lib/types";

interface Props {
  clientId: string;
  screening: ScreeningResult;
  programs: ProgramDefinition[];
}

interface GapField {
  key: keyof ApplicationProfile;
  program_ids: string[];
}

// Label + input shape for each ApplicationProfile key the gap-fill form can
// collect. "ssn_encrypted" is the gap key (see src/lib/apply/gapFields.ts)
// but the PATCH body field is plaintext "ssn" — the API route encrypts it
// server-side (src/app/api/clients/[id]/application-profile/route.ts).
const FIELD_META: Partial<Record<keyof ApplicationProfile, { label: string; type: string; patchKey: string }>> = {
  legal_name: { label: "Full legal name", type: "text", patchKey: "legal_name" },
  date_of_birth: { label: "Date of birth", type: "date", patchKey: "date_of_birth" },
  street_address: { label: "Street address", type: "text", patchKey: "street_address" },
  city: { label: "City", type: "text", patchKey: "city" },
  mailing_zip_code: { label: "Mailing ZIP code", type: "text", patchKey: "mailing_zip_code" },
  phone: { label: "Phone number", type: "tel", patchKey: "phone" },
  email: { label: "Email address", type: "email", patchKey: "email" },
  pge_account_number: { label: "PG&E account number", type: "text", patchKey: "pge_account_number" },
  sfpuc_account_number: { label: "SFPUC water/sewer account number", type: "text", patchKey: "sfpuc_account_number" },
  ssn_encrypted: { label: "Social Security Number", type: "password", patchKey: "ssn" },
};

const STATUS_LABEL: Record<Submission["status"], string> = {
  queued: "Queued",
  collecting_info: "Collecting information",
  filling: "Filling out the form…",
  awaiting_review: "Ready for your review",
  submitting: "Submitting…",
  submitted: "Submitted",
  failed: "Something went wrong",
  needs_human: "Needs your attention",
};

const CONSENT_TEXT =
  "By continuing, you authorize Benefy to fill out and, for programs marked \"auto-submit,\" submit these applications on your behalf using the information in your profile. Nothing is ever submitted without you reviewing a filled draft first and tapping Confirm.";

export default function ApplyPanel({ clientId, screening, programs }: Props) {
  const likelyEligible = programs.filter((p) => {
    const result = screening.results.find((r) => r.program_id === p.program_id);
    return result?.status === "likely_eligible";
  });
  // ready: we can fill/submit end-to-end (verified adapter). manual: shown so
  // the list feels complete, but the user applies for these themselves.
  const ready = likelyEligible.filter((p) => p.application.auto_apply_ready);
  const manual = likelyEligible.filter((p) => !p.application.auto_apply_ready);

  const [selected, setSelected] = useState<Set<string>>(new Set(ready.map((p) => p.program_id)));
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "consent" | "gaps">("select");
  const [consentChecked, setConsentChecked] = useState(false);
  const [gaps, setGaps] = useState<GapField[]>([]);
  const [gapValues, setGapValues] = useState<Record<string, string>>({});
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshSubmissions() {
    const res = await fetch(`/api/clients/${clientId}/apply`);
    if (res.ok) {
      const data = await res.json();
      setSubmissions(data.submissions ?? []);
    }
  }

  useEffect(() => {
    refreshSubmissions();
  }, [clientId]);

  // Poll while anything is still in flight so "awaiting_review"/"submitted"
  // show up without a manual refresh.
  useEffect(() => {
    const inFlight = submissions.some((s) => !["submitted", "failed", "needs_human"].includes(s.status));
    if (!inFlight) return;
    const id = setInterval(refreshSubmissions, 4000);
    return () => clearInterval(id);
  }, [submissions, clientId]);

  if (likelyEligible.length === 0) return null;

  function toggle(programId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  }

  async function startApply() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_ids: Array.from(selected) }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setGaps(data.missing_fields ?? []);
        setStep("gaps");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't start applying — try again.");
        return;
      }
      setOpen(false);
      setStep("select");
      setConsentChecked(false);
      await refreshSubmissions();
    } finally {
      setBusy(false);
    }
  }

  function togglePanel() {
    setOpen((v) => !v);
    setStep("select");
    setConsentChecked(false);
    setError(null);
  }

  async function submitGaps() {
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      for (const gap of gaps) {
        const meta = FIELD_META[gap.key];
        if (!meta) continue;
        const value = gapValues[gap.key];
        if (value) patch[meta.patchKey] = value;
      }
      const res = await fetch(`/api/clients/${clientId}/application-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError("Couldn't save those details — try again.");
        return;
      }
      // Retry the apply now that the gap is filled.
      await startApply();
    } finally {
      setBusy(false);
    }
  }

  async function confirmSubmission(submissionId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/submissions/${submissionId}/confirm`, { method: "POST" });
      if (res.ok) await refreshSubmissions();
    } finally {
      setBusy(false);
    }
  }

  const programName = (id: string) => programs.find((p) => p.program_id === id)?.name ?? id;
  const programFormUrl = (id: string) => programs.find((p) => p.program_id === id)?.application.form_url;
  const hasTransUnionProgram = Array.from(selected).includes("sfpuc_cap");

  return (
    <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-semibold text-slate-900">
            Let Benefy apply for you
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {ready.length > 0
              ? `We'll fill out ${ready.length} of your likely-eligible ${
                  ready.length === 1 ? "application" : "applications"
                } — you review before anything is sent.`
              : "None of your eligible programs support automatic apply yet — we'll hand you a prefilled draft for each to finish yourself."}
          </p>
        </div>
        <button
          onClick={togglePanel}
          className="shrink-0 rounded-full bg-teal-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-800"
        >
          {open ? "Close" : "Apply automatically →"}
        </button>
      </div>

      {open && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          {error && <p className="mb-3 text-xs text-red-700">{error}</p>}

          {step === "select" && (
            <>
              <p className="mb-2 text-xs font-semibold text-slate-700">Which programs?</p>
              <div className="space-y-2">
                {ready.map((p) => (
                  <label key={p.program_id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.has(p.program_id)}
                      onChange={() => toggle(p.program_id)}
                      className="h-4 w-4"
                    />
                    {p.name}
                    <span className="text-[11px] text-slate-400">
                      ({p.application.apply_mode === "web_submit" ? "auto-submit" : "generates a filled PDF"})
                    </span>
                  </label>
                ))}
                {manual.map((p) => (
                  <div key={p.program_id} className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                    <input type="checkbox" checked={false} disabled readOnly className="h-4 w-4" />
                    {p.name}
                    <span className="text-[11px]">{"— you'll apply for this yourself"}</span>
                    {p.application.form_url && (
                      <a
                        href={p.application.form_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-medium text-teal-700 hover:underline"
                      >
                        Open form ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
              {ready.length > 0 && (
                <button
                  disabled={selected.size === 0}
                  onClick={() => setStep("consent")}
                  className="mt-4 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
                >
                  Continue
                </button>
              )}
            </>
          )}

          {step === "consent" && (
            <>
              <p className="mb-2 text-xs font-semibold text-slate-700">Before we start</p>
              <p className="text-xs text-slate-600">{CONSENT_TEXT}</p>
              {hasTransUnionProgram && (
                <p className="mt-3 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
                  SFPUC&apos;s application separately authorizes SFPUC to verify your income with TransUnion (a
                  credit bureau) — this does not affect your credit score, but it is a real check. You&apos;ll see
                  this again on the SFPUC form itself before anything is submitted.
                </p>
              )}
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                I&apos;ve read this and want Benefy to proceed.
              </label>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => setStep("select")}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  ← Back
                </button>
                <button
                  disabled={busy || !consentChecked}
                  onClick={startApply}
                  className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "gaps" && (
            <>
              <p className="mb-2 text-xs font-semibold text-slate-700">A few more details needed</p>
              <div className="space-y-3">
                {gaps.map((gap) => {
                  const meta = FIELD_META[gap.key];
                  if (!meta) return null;
                  return (
                    <label key={gap.key} className="block text-xs text-slate-600">
                      {meta.label}
                      <input
                        type={meta.type}
                        value={gapValues[gap.key] ?? ""}
                        onChange={(e) => setGapValues((prev) => ({ ...prev, [gap.key]: e.target.value }))}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        autoComplete="off"
                      />
                      <span className="text-[11px] text-slate-400">
                        needed for: {gap.program_ids.map(programName).join(", ")}
                      </span>
                    </label>
                  );
                })}
              </div>
              <button
                disabled={busy || gaps.some((g) => FIELD_META[g.key] && !gapValues[g.key])}
                onClick={submitGaps}
                className="mt-3 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {submissions.length > 0 && (
        <div className="mt-4 space-y-2">
          {submissions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{programName(s.program_id)}</p>
                <p className="text-xs text-slate-500">{STATUS_LABEL[s.status]}</p>
                {s.status === "needs_human" && (
                  <p className="mt-1 text-xs text-amber-700">
                    {s.error ?? "We couldn't finish this one automatically."} Nothing was submitted — you can
                    still apply yourself.
                  </p>
                )}
                {s.status === "submitted" && s.receipt_note && (
                  <p className="mt-1 text-xs text-emerald-700">{s.receipt_note}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {s.status === "needs_human" && programFormUrl(s.program_id) && (
                  <a
                    href={programFormUrl(s.program_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                  >
                    Apply yourself ↗
                  </a>
                )}
                {s.artifacts.length > 0 && (
                  <a
                    href={s.artifacts[s.artifacts.length - 1].url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-teal-700 hover:underline"
                  >
                    {s.artifacts[s.artifacts.length - 1].kind === "pdf"
                      ? "View PDF"
                      : s.status === "awaiting_review"
                        ? "Review draft"
                        : s.status === "submitted"
                          ? "View confirmation"
                          : "View screenshot"}{" "}
                    ↗
                  </a>
                )}
                {s.status === "awaiting_review" && (
                  <button
                    disabled={busy}
                    onClick={() => confirmSubmission(s.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Confirm & submit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
