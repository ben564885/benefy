"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile } from "@/lib/types";
import {
  CORE_REQUIRED_FIELDS,
  missingCoreFields,
  missingSeniorDisabilityField,
} from "@/lib/gradient/intakeExtractor";

interface Props {
  messages: ChatMessage[];
  profile: ClientProfile;
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

type ActiveField =
  | "household_size"
  | "monthly_income_gross"
  | "sf_resident"
  | "immigration_status"
  | "senior_disability"
  | null;

const CHIPS: Record<Exclude<ActiveField, "monthly_income_gross" | null>, { label: string; value: string }[]> = {
  household_size: [
    { label: "1 (just me)", value: "I live alone" },
    { label: "2", value: "Household of 2" },
    { label: "3", value: "Household of 3" },
    { label: "4", value: "Household of 4" },
    { label: "5", value: "Household of 5" },
    { label: "6+", value: "Household of 6" },
  ],
  sf_resident: [
    { label: "Yes", value: "Yes, I live in San Francisco" },
    { label: "No", value: "No, I live outside San Francisco" },
  ],
  immigration_status: [
    { label: "U.S. citizen", value: "I'm a U.S. citizen" },
    { label: "Permanent resident (green card)", value: "I'm a permanent resident (green card)" },
    { label: "Other status", value: "Other immigration status" },
    { label: "Not sure", value: "I'm not sure about my immigration status" },
  ],
  senior_disability: [
    { label: "Yes, a senior (65+)", value: "Someone in my household is a senior (65+)" },
    { label: "Yes, a disability", value: "Someone in my household has a disability" },
    { label: "No, neither", value: "No one is a senior and no one has a disability" },
  ],
};

function IncomeQuickInput({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<"month" | "year">("month");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[^0-9.]/g, ""));
    if (!amount.trim() || Number.isNaN(n) || n <= 0) return;
    onSubmit(`$${n} a ${period}`);
    setAmount("");
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">$</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={disabled}
        placeholder="2,400"
        className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-teal-500 disabled:bg-slate-50"
      />
      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setPeriod("month")}
          className={`rounded-md px-2 py-1 font-medium transition ${
            period === "month" ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          /month
        </button>
        <button
          type="button"
          onClick={() => setPeriod("year")}
          className={`rounded-md px-2 py-1 font-medium transition ${
            period === "year" ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          /year
        </button>
      </div>
      <button
        type="submit"
        disabled={disabled || !amount.trim()}
        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue
      </button>
    </form>
  );
}

export default function ChatPanel({ messages, profile, onSend, disabled, placeholder }: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const missing = missingCoreFields(profile);
  const coreDone = missing.length === 0;
  const showOptional = coreDone && missingSeniorDisabilityField(profile);
  const activeField: ActiveField = !coreDone
    ? (missing[0].key as ActiveField)
    : showOptional
      ? "senior_disability"
      : null;
  const questionNumber = CORE_REQUIRED_FIELDS.length - missing.length + 1;
  const questionPrompt = !coreDone
    ? missing[0].prompt
    : "Is anyone in your household a senior (65+) or living with a disability? Optional — it only affects one SF program.";

  async function submitMessage(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft;
    setDraft("");
    await submitMessage(text);
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {activeField && (
        <div className="border-b border-slate-100 bg-teal-50/60 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              {coreDone ? "Optional" : `Question ${questionNumber} of ${CORE_REQUIRED_FIELDS.length}`}
            </span>
            {!coreDone && (
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-teal-100">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${(questionNumber / CORE_REQUIRED_FIELDS.length) * 100}%` }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">{questionPrompt}</p>

          {activeField === "monthly_income_gross" ? (
            <IncomeQuickInput onSubmit={submitMessage} disabled={disabled || sending} />
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {CHIPS[activeField].map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  disabled={disabled || sending}
                  onClick={() => submitMessage(chip.value)}
                  className="rounded-full border border-teal-200 bg-white px-3.5 py-1.5 text-sm font-medium text-teal-800 transition hover:border-teal-400 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!activeField && messages.length > 0 && (
        <div className="border-b border-slate-100 bg-emerald-50/60 px-5 py-3 text-sm font-medium text-emerald-800">
          Profile complete — ready to see what you qualify for →
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ minHeight: "20rem", maxHeight: "28rem" }}>
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Prefer to describe your whole situation at once? Type it below — e.g. &ldquo;single mom, two
            kids, I make about $2,400 a month, on Medi-Cal, live in the Tenderloin&rdquo; — and we&apos;ll
            fill in everything we can and only ask about what&apos;s left.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-teal-700 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">Thinking…</div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-100 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled || sending}
          placeholder={placeholder ?? "Or type your own answer…"}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={disabled || sending || !draft.trim()}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
