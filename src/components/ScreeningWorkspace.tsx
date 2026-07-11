"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile, ClientRecord, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import ChatPanel, { type ThreadItem } from "@/components/ChatPanel";
import RealtimeVoiceIntake from "@/components/RealtimeVoiceIntake";
import { LANGS, type Lang } from "@/lib/i18n";
import { missingCoreFields } from "@/lib/gradient/intakeExtractor";

interface Props {
  clientId: string;
  initialRecord: ClientRecord;
  initialChat: ChatMessage[];
  initialTrace: TraceStep[];
  programs: ProgramDefinition[];
  header?: React.ReactNode;
  signOut?: React.ReactNode;
}

function canRunScreen(profile: ClientProfile, veteranStepDismissed: boolean): boolean {
  return missingCoreFields(profile).length === 0 && (profile.is_veteran != null || veteranStepDismissed);
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

export default function ScreeningWorkspace({
  clientId,
  initialRecord,
  initialChat,
  initialTrace,
  programs,
  header,
  signOut,
}: Props) {
  const [profile, setProfile] = useState<ClientProfile>(initialRecord.profile);
  const [thread, setThread] = useState<ThreadItem[]>(() =>
    buildInitialThread(initialChat, initialRecord, initialTrace),
  );
  const [hasScreening, setHasScreening] = useState(initialRecord.last_screening != null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [veteranStepDismissed, setVeteranStepDismissed] = useState(initialRecord.profile.is_veteran != null);
  const [intakeMode, setIntakeMode] = useState<"text" | "voice">("text");
  const [lang, setLang] = useState<Lang>("en");
  const [resolving, setResolving] = useState<{ programId: string; name: string } | null>(null);

  function handleQuestionAsked(text: string) {
    setThread((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "message" && last.message.role === "assistant" && last.message.content === text) {
        return prev;
      }
      return [...prev, { kind: "message", message: { role: "assistant", content: text, timestamp: new Date().toISOString() } }];
    });
  }

  async function refreshRecord() {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (!res.ok) return;
    setProfile(data.client.profile);
  }

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

  function patchLatestResults(screening: ScreeningResult, trace: TraceStep[]) {
    setThread((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        const item = next[i];
        if (item.kind === "results") {
          next[i] = { ...item, screening, trace };
          break;
        }
      }
      return next;
    });
  }

  async function handleAskQuestion(question: string): Promise<string | null> {
    const res = await fetch(`/api/clients/${clientId}/intake`, {
      method: "POST",
      body: JSON.stringify({ message: question, lang }),
    });
    const data = await res.json();
    if (!res.ok) return "Sorry, I couldn't answer that right now. Please try again.";

    return (
      data.assistant_reply?.trim() ||
      "I couldn't generate an answer. Try asking about a specific program, or click \"What does this mean?\""
    );
  }

  async function handleSend(message: string, guided?: boolean, display?: string) {
    setThread((prev) => [
      ...prev,
      {
        kind: "message",
        message: { role: "user", content: display ?? message, timestamp: new Date().toISOString() },
      },
    ]);

    if (resolving) {
      const res = await fetch(`/api/clients/${clientId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ program_id: resolving.programId, message, lang }),
      });
      const data = await res.json();
      if (!res.ok) return;
      if (data.assistant_reply) {
        setThread((prev) => [
          ...prev,
          {
            kind: "message",
            message: { role: "assistant", content: data.assistant_reply, timestamp: new Date().toISOString() },
          },
        ]);
      }
      if (data.profile) setProfile(data.profile);
      if (data.screening) patchLatestResults(data.screening, data.trace ?? []);
      const nextId: string | null = data.resolving_program_id ?? null;
      const nextProgram = nextId ? programs.find((p) => p.program_id === nextId) : undefined;
      setResolving(nextProgram ? { programId: nextProgram.program_id, name: nextProgram.name } : null);
      return;
    }

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
    }

    const updatedProfile: ClientProfile = data.profile ?? profile;
    if (data.profile) setProfile(data.profile);
    if (updatedProfile.is_veteran != null) {
      setVeteranStepDismissed(true);
    }

    if (data.resolve_target?.program_id) {
      const program = programs.find((p) => p.program_id === data.resolve_target.program_id);
      if (program) setResolving({ programId: program.program_id, name: program.name });
    }

    const readyToScreen = canRunScreen(
      updatedProfile,
      veteranStepDismissed || updatedProfile.is_veteran != null,
    );
    if (!hasScreening && readyToScreen) {
      await runScreen();
    } else if (hasScreening && data.ready_to_screen) {
      await runScreen();
    }
  }

  async function handleSkipVeteran() {
    setVeteranStepDismissed(true);
    if (!hasScreening && canRunScreen(profile, true)) {
      await runScreen();
    }
  }

  async function handleResolve(programId: string) {
    const program = programs.find((p) => p.program_id === programId);
    if (!program) return;
    const res = await fetch(`/api/clients/${clientId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ program_id: programId, lang }),
    });
    const data = await res.json();
    if (!res.ok) return;
    if (data.assistant_reply) {
      setThread((prev) => [
        ...prev,
        {
          kind: "message",
          message: { role: "assistant", content: data.assistant_reply, timestamp: new Date().toISOString() },
        },
      ]);
    }
    setResolving(data.resolvable ? { programId, name: program.name } : null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        {header}
        <div className="flex flex-wrap items-center justify-end gap-3">
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
          {signOut}
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
          onSkipVeteran={handleSkipVeteran}
          onResolve={handleResolve}
          onRecheck={runScreen}
          screeningLoading={screeningLoading}
          veteranStepDismissed={veteranStepDismissed}
          hasScreening={hasScreening}
          onAskQuestion={handleAskQuestion}
          onQuestionAsked={handleQuestionAsked}
          resolving={resolving}
          onCancelResolve={() => setResolving(null)}
        />
      ) : (
        <RealtimeVoiceIntake clientId={clientId} lang={lang} onProfileUpdated={refreshRecord} />
      )}
    </div>
  );
}
