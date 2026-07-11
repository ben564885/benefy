"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile, ClientRecord, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import ChatPanel, { type ThreadItem } from "@/components/ChatPanel";
import { missingSeniorDisabilityField, missingVeteranField } from "@/lib/gradient/intakeExtractor";
import RealtimeVoiceIntake from "@/components/RealtimeVoiceIntake";
import { LANGS, type Lang } from "@/lib/i18n";

interface Props {
  clientId: string;
  initialRecord: ClientRecord;
  initialChat: ChatMessage[];
  initialTrace: TraceStep[];
  programs: ProgramDefinition[];
}

function isReadyToScreen(profile: ClientProfile): boolean {
  return (
    profile.household_size != null &&
    (profile.monthly_income_gross != null || profile.annual_income_gross != null) &&
    profile.sf_resident != null &&
    profile.immigration_status != null
  );
}

function canRunScreen(
  profile: ClientProfile,
  seniorStepDismissed: boolean,
  veteranStepDismissed: boolean,
): boolean {
  return (
    isReadyToScreen(profile) &&
    (!missingSeniorDisabilityField(profile) || seniorStepDismissed) &&
    (profile.is_veteran != null || veteranStepDismissed)
  );
}

function buildInitialThread(
  initialChat: ChatMessage[],
  initialRecord: ClientRecord,
  initialTrace: TraceStep[],
): ThreadItem[] {
  const items: ThreadItem[] = initialChat.map((message) => ({ kind: "message", message }));
  if (initialRecord.last_screening) {
    items.push({
      kind: "results",
      screening: initialRecord.last_screening,
      explanation: null,
      citations: [],
      mode: null,
      trace: initialTrace,
    });
  }
  return items;
}

export default function ScreeningWorkspace({ clientId, initialRecord, initialChat, initialTrace, programs }: Props) {
  const [profile, setProfile] = useState<ClientProfile>(initialRecord.profile);
  const [thread, setThread] = useState<ThreadItem[]>(() =>
    buildInitialThread(initialChat, initialRecord, initialTrace),
  );
  const [hasScreening, setHasScreening] = useState(initialRecord.last_screening != null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [seniorStepDismissed, setSeniorStepDismissed] = useState(
    !missingSeniorDisabilityField(initialRecord.profile),
  );
  const [veteranStepDismissed, setVeteranStepDismissed] = useState(
    initialRecord.profile.is_veteran != null,
  );
  const [intakeMode, setIntakeMode] = useState<"text" | "voice">("text");
  const [lang, setLang] = useState<Lang>("en");

  async function refreshRecord() {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (!res.ok) return;
    setProfile(data.client.profile);
  }

  // Fetches the Navigator explanation after the engine result is already on
  // screen, and patches it into the newest results item. Fire-and-forget —
  // the dollar reveal never waits on a language model.
  function fillInExplanation() {
    fetch(`/api/clients/${clientId}/explain`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        setThread((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            const item = next[i];
            if (item.kind === "results" && item.explanationPending) {
              next[i] = res.ok
                ? {
                    ...item,
                    explanation: data.explanation ?? null,
                    explanationPending: false,
                    citations: data.citations ?? [],
                    mode: data.mode ?? null,
                    trace: data.trace ?? item.trace,
                  }
                : { ...item, explanationPending: false };
              break;
            }
          }
          return next;
        });
      })
      .catch(() => {
        setThread((prev) =>
          prev.map((item) =>
            item.kind === "results" && item.explanationPending ? { ...item, explanationPending: false } : item,
          ),
        );
      });
  }

  async function runScreen() {
    setScreeningLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/screen`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return;
      const resultsItem: ThreadItem = {
        kind: "results",
        screening: data.screening as ScreeningResult,
        explanation: data.explanation ?? null,
        explanationPending: data.explanation == null,
        citations: data.citations ?? [],
        mode: data.mode ?? null,
        trace: data.trace ?? [],
      };
      setThread((prev) => [...prev, resultsItem]);
      setHasScreening(true);
      if (data.explanation == null) fillInExplanation();
    } finally {
      setScreeningLoading(false);
    }
  }

  async function handleAskQuestion(question: string): Promise<string | null> {
    const res = await fetch(`/api/clients/${clientId}/intake`, {
      method: "POST",
      body: JSON.stringify({ message: question, lang }),
    });
    const data = await res.json();
    if (!res.ok) return "Sorry, I couldn't answer that right now. Please try again.";

    const reply =
      data.assistant_reply?.trim() ||
      "I couldn't generate an answer. Try asking about a specific program, or click \"What does this mean?\"";

    setThread((prev) => [
      ...prev,
      {
        kind: "message",
        message: { role: "user", content: question, timestamp: new Date().toISOString() },
      },
      {
        kind: "message" as const,
        message: {
          role: "assistant" as const,
          content: reply,
          timestamp: new Date().toISOString(),
        },
      },
    ]);

    return reply;
  }

  async function handleSend(message: string, guided?: boolean, display?: string) {
    setThread((prev) => [
      ...prev,
      {
        kind: "message",
        message: { role: "user", content: display ?? message, timestamp: new Date().toISOString() },
      },
    ]);

    const res = await fetch(`/api/clients/${clientId}/intake`, {
      method: "POST",
      body: JSON.stringify({ message, guided: guided === true, display, lang }),
    });
    const data = await res.json();
    if (!res.ok) return;

    if (data.assistant_reply?.trim()) {
      setThread((prev) => [
        ...prev,
        {
          kind: "message",
          message: { role: "assistant", content: data.assistant_reply, timestamp: new Date().toISOString() },
        },
      ]);
    } else if (hasScreening && data.target === "navigator") {
      setThread((prev) => [
        ...prev,
        {
          kind: "message",
          message: {
            role: "assistant",
            content: "I couldn't generate an answer. Try asking about a specific program by name.",
            timestamp: new Date().toISOString(),
          },
        },
      ]);
    }

    const updatedProfile: ClientProfile = data.profile ?? profile;
    if (data.profile) setProfile(data.profile);
    if (!missingSeniorDisabilityField(updatedProfile)) {
      setSeniorStepDismissed(true);
    }
    if (updatedProfile.is_veteran != null) {
      setVeteranStepDismissed(true);
    }

    const readyToScreen = canRunScreen(
      updatedProfile,
      seniorStepDismissed || !missingSeniorDisabilityField(updatedProfile),
      veteranStepDismissed || updatedProfile.is_veteran != null,
    );
    if (!hasScreening && readyToScreen) {
      await runScreen();
    } else if (hasScreening && data.ready_to_screen) {
      await runScreen();
    }
  }

  async function handleSkipSenior() {
    setSeniorStepDismissed(true);
    if (!hasScreening && canRunScreen(profile, true, veteranStepDismissed)) {
      await runScreen();
    }
  }

  async function handleSkipVeteran() {
    setVeteranStepDismissed(true);
    if (!hasScreening && canRunScreen(profile, seniorStepDismissed, true)) {
      await runScreen();
    }
  }

  function handleResolve(programId: string) {
    const program = programs.find((p) => p.program_id === programId);
    if (!program) return;
    setThread((prev) => [
      ...prev,
      {
        kind: "message",
        message: {
          role: "assistant",
          content: `Let's resolve ${program.name}. What can you tell me?`,
          timestamp: new Date().toISOString(),
        },
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 self-end">
        <div className="flex w-fit gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                lang === l.code ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex w-fit gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
        <button
          onClick={() => setIntakeMode("text")}
          className={`rounded-full px-3 py-1 font-medium transition ${
            intakeMode === "text" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setIntakeMode("voice")}
          className={`rounded-full px-3 py-1 font-medium transition ${
            intakeMode === "voice" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Voice (beta)
        </button>
        </div>
      </div>

      {intakeMode === "text" ? (
        <ChatPanel
          thread={thread}
          profile={profile}
          clientId={clientId}
          programs={programs}
          lang={lang}
          onSend={handleSend}
          onSkipSenior={handleSkipSenior}
          onSkipVeteran={handleSkipVeteran}
          onResolve={handleResolve}
          onRecheck={runScreen}
          screeningLoading={screeningLoading}
          seniorStepDismissed={seniorStepDismissed}
          veteranStepDismissed={veteranStepDismissed}
          hasScreening={hasScreening}
          onAskQuestion={handleAskQuestion}
        />
      ) : (
        <RealtimeVoiceIntake clientId={clientId} lang={lang} onProfileUpdated={refreshRecord} />
      )}
    </div>
  );
}
