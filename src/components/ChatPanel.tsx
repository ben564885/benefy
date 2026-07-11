"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import {
  CORE_REQUIRED_FIELDS,
  missingCoreFields,
  missingSeniorDisabilityField,
} from "@/lib/gradient/intakeExtractor";
import ResultsCard from "@/components/ResultsCard";

export type ThreadItem =
  | { kind: "message"; message: ChatMessage }
  | {
      kind: "results";
      screening: ScreeningResult;
      explanation: string | null;
      citations: { program_id: string; source: string; url: string }[];
      mode: "live_gradient_agent" | "live_inference" | "local_fallback" | null;
      trace: TraceStep[];
    };

interface Props {
  thread: ThreadItem[];
  profile: ClientProfile;
  clientId: string;
  programs: ProgramDefinition[];
  onSend: (message: string) => Promise<void>;
  onResolve: (programId: string) => void;
  onRecheck?: () => void;
  screeningLoading?: boolean;
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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">$</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={disabled}
        placeholder="2,400"
        className="w-28 rounded-full border border-slate-200 px-3.5 py-1.5 text-sm outline-none focus:border-teal-400 disabled:bg-slate-50"
      />
      <div className="flex rounded-full border border-slate-200 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setPeriod("month")}
          className={`rounded-full px-2.5 py-1 font-medium transition ${
            period === "month" ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          /month
        </button>
        <button
          type="button"
          onClick={() => setPeriod("year")}
          className={`rounded-full px-2.5 py-1 font-medium transition ${
            period === "year" ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          /year
        </button>
      </div>
      <button
        type="submit"
        disabled={disabled || !amount.trim()}
        className="rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue
      </button>
    </form>
  );
}

export default function ChatPanel({
  thread,
  profile,
  clientId,
  programs,
  onSend,
  onResolve,
  onRecheck,
  screeningLoading,
  disabled,
  placeholder,
}: Props) {
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
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto py-6" style={{ minHeight: "24rem" }}>
        {thread.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <h2 className="text-2xl font-semibold text-slate-900">What&apos;s your situation?</h2>
            <p className="max-w-md text-sm text-slate-500">
              Tell me about your household — or just answer the quick questions below — and I&apos;ll surface every
              SF benefit you likely qualify for, right here.
            </p>
          </div>
        )}
        {thread.map((item, i) =>
          item.kind === "message" ? (
            <div key={i} className={`flex ${item.message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm ${
                  item.message.role === "user" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                {item.message.content}
              </div>
            </div>
          ) : (
            <ResultsCard
              key={i}
              clientId={clientId}
              screening={item.screening}
              programs={programs}
              explanation={item.explanation}
              citations={item.citations}
              mode={item.mode}
              trace={item.trace}
              onResolve={onResolve}
              onRecheck={onRecheck}
            />
          ),
        )}
        {(sending || screeningLoading) && (
          <div className="flex justify-start">
            <div className="rounded-3xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
              {screeningLoading ? "Checking what you qualify for…" : "Thinking…"}
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 bg-gradient-to-t from-white via-white/95 to-transparent pt-4">
        {activeField && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-400">
              {coreDone ? "Optional" : `Question ${questionNumber} of ${CORE_REQUIRED_FIELDS.length}`} ·{" "}
              {questionPrompt}
            </span>
            {activeField === "monthly_income_gross" ? (
              <IncomeQuickInput onSubmit={submitMessage} disabled={disabled || sending} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {CHIPS[activeField].map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    disabled={disabled || sending}
                    onClick={() => submitMessage(chip.value)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled || sending}
            placeholder={placeholder ?? "Or describe your whole situation…"}
            className="flex-1 rounded-full px-3 py-1.5 text-sm outline-none disabled:bg-white"
          />
          <button
            type="submit"
            disabled={disabled || sending || !draft.trim()}
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
