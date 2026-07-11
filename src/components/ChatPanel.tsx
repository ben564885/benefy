"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ClientProfile, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import {
  CORE_REQUIRED_FIELDS,
  missingCoreFields,
  missingSeniorDisabilityField,
} from "@/lib/gradient/intakeExtractor";
import { INTAKE_STRINGS, type Lang } from "@/lib/i18n";
import LinkifiedText from "@/components/LinkifiedText";
import ResultsCard from "@/components/ResultsCard";

export type ThreadItem =
  | { kind: "message"; message: ChatMessage }
  | {
      kind: "results";
      screening: ScreeningResult;
      explanation: string | null;
      explanationPending?: boolean;
      citations: { program_id: string; source: string; url: string }[];
      mode: "live_gradient_agent" | "live_inference" | "local_fallback" | null;
      trace: TraceStep[];
    };

interface Props {
  thread: ThreadItem[];
  profile: ClientProfile;
  clientId: string;
  programs: ProgramDefinition[];
  lang?: Lang;
  onSend: (message: string, guided?: boolean, display?: string) => Promise<void>;
  onSkipSenior?: () => void;
  onSkipVeteran?: () => void;
  onResolve: (programId: string) => void;
  onRecheck?: () => void;
  screeningLoading?: boolean;
  seniorStepDismissed?: boolean;
  veteranStepDismissed?: boolean;
  hasScreening?: boolean;
  onAskQuestion?: (question: string) => Promise<string | null>;
  disabled?: boolean;
  placeholder?: string;
}

type ActiveField =
  | "household_size"
  | "monthly_income_gross"
  | "sf_resident"
  | "immigration_status"
  | "senior_disability"
  | "veteran_status"
  | null;

function IncomeQuickInput({
  lang,
  onSubmit,
  disabled,
}: {
  lang: Lang;
  onSubmit: (text: string, guided?: boolean, display?: string) => void;
  disabled?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const t = INTAKE_STRINGS[lang];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[^0-9.]/g, ""));
    if (!amount.trim() || Number.isNaN(n) || n <= 0) return;
    const display = `$${n.toLocaleString()} ${period === "month" ? t.perMonth : t.perYear}`;
    onSubmit(`$${n} a ${period}`, true, display);
    setAmount("");
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-slate-600">$</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={disabled}
        placeholder={t.incomePlaceholder}
        className="w-28 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-400 disabled:bg-slate-50"
      />
      <div className="flex rounded-full border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
        <button
          type="button"
          onClick={() => setPeriod("month")}
          className={`rounded-full px-2.5 py-1 font-medium transition ${
            period === "month" ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.perMonth}
        </button>
        <button
          type="button"
          onClick={() => setPeriod("year")}
          className={`rounded-full px-2.5 py-1 font-medium transition ${
            period === "year" ? "bg-teal-700 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.perYear}
        </button>
      </div>
      <button
        type="submit"
        disabled={disabled || !amount.trim()}
        className="rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t.continueLabel}
      </button>
    </form>
  );
}

export default function ChatPanel({
  thread,
  profile,
  clientId,
  programs,
  lang = "en",
  onSend,
  onSkipSenior,
  onSkipVeteran,
  onResolve,
  onRecheck,
  screeningLoading,
  seniorStepDismissed = false,
  veteranStepDismissed = false,
  hasScreening = false,
  onAskQuestion,
  disabled,
  placeholder,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingGuided, setSendingGuided] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = INTAKE_STRINGS[lang];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, sending, screeningLoading]);

  const missing = missingCoreFields(profile);
  const coreDone = missing.length === 0;
  const seniorStepDone = !missingSeniorDisabilityField(profile) || seniorStepDismissed;
  const showSeniorOptional = coreDone && missingSeniorDisabilityField(profile) && !seniorStepDismissed;
  const showVeteranOptional = coreDone && seniorStepDone && profile.is_veteran == null && !veteranStepDismissed;
  const activeField: ActiveField = !coreDone
    ? (missing[0].key as ActiveField)
    : showSeniorOptional
      ? "senior_disability"
      : showVeteranOptional
        ? "veteran_status"
        : null;
  const questionNumber = CORE_REQUIRED_FIELDS.length - missing.length + 1;
  const questionPrompt = !coreDone
    ? t.prompts[missing[0].key as string]
    : showSeniorOptional
      ? t.seniorDisabilityPrompt
      : t.veteranPrompt;

  async function submitMessage(text: string, guided = false, display?: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    if (guided) setSendingGuided(true);
    try {
      await onSend(text, guided, display);
    } finally {
      setSending(false);
      setSendingGuided(false);
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
      <div
        ref={scrollRef}
        className={`flex flex-1 flex-col space-y-5 overflow-y-auto py-6 ${
          thread.length === 0 ? "justify-center" : "justify-end"
        }`}
        style={{ minHeight: "24rem" }}
      >
        {thread.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <h2 className="text-2xl font-semibold text-slate-900">{t.emptyTitle}</h2>
            <p className="max-w-md text-sm text-slate-500">{t.emptySub}</p>
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
                {item.message.role === "assistant" ? (
                  <LinkifiedText
                    text={item.message.content}
                    linkClassName="text-teal-800 underline underline-offset-2 hover:text-teal-900"
                  />
                ) : (
                  item.message.content
                )}
              </div>
            </div>
          ) : (
            <ResultsCard
              key={i}
              clientId={clientId}
              screening={item.screening}
              programs={programs}
              explanation={item.explanation}
              explanationPending={item.explanationPending}
              citations={item.citations}
              mode={item.mode}
              trace={item.trace}
              lang={lang}
              onAsk={onAskQuestion}
              onResolve={onResolve}
              onRecheck={onRecheck}
            />
          ),
        )}
        {((sending && !sendingGuided) || screeningLoading) && (
          <div className="flex justify-start">
            <div className="rounded-3xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
              {screeningLoading ? t.checking : t.thinking}
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 pt-4">
        {activeField && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-400">
              {coreDone ? t.optional : t.questionOf(questionNumber, CORE_REQUIRED_FIELDS.length)} ·{" "}
              {questionPrompt}
            </span>
            {activeField === "monthly_income_gross" ? (
              <IncomeQuickInput lang={lang} onSubmit={submitMessage} disabled={disabled || sending} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {t.chips[activeField].map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    disabled={disabled || sending}
                    onClick={() => submitMessage(chip.value, true, chip.label)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
                {(activeField === "senior_disability" || activeField === "veteran_status") && (
                  <button
                    type="button"
                    disabled={disabled || sending}
                    onClick={activeField === "senior_disability" ? onSkipSenior : onSkipVeteran}
                    className="rounded-full border border-transparent px-4 py-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.skipOptionalLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled || sending}
            placeholder={
              hasScreening ? t.summaryAskPlaceholder : (placeholder ?? t.composerPlaceholder)
            }
            className="flex-1 rounded-full px-3 py-1.5 text-sm outline-none disabled:bg-white"
          />
          <button
            type="submit"
            disabled={disabled || sending || !draft.trim()}
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-40"
          >
            {t.send}
          </button>
        </form>
      </div>
    </div>
  );
}
