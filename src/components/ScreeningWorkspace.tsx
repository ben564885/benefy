"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile, ClientRecord, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import ChatPanel, { type ThreadItem } from "@/components/ChatPanel";
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
  const [intakeMode, setIntakeMode] = useState<"text" | "voice">("text");
  const [lang, setLang] = useState<Lang>("en");
  const [resolving, setResolving] = useState<{ programId: string; name: string } | null>(null);

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

  // Replaces the newest results card's screening in place so the dollar
  // total ticks up (and amber cards flip) as resolution answers land,
  // instead of stacking a second full results card in the thread.
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
      // The server chains to the next needs-review program automatically —
      // follow it, or exit resolution mode when nothing resolvable is left.
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

    if (data.assistant_reply) {
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

    // "Resolve the unresolved" typed into the composer: the intake route
    // answers with the first targeted question and hands us the program to
    // enter resolution mode on.
    if (data.resolve_target?.program_id) {
      const program = programs.find((p) => p.program_id === data.resolve_target.program_id);
      if (program) setResolving({ programId: program.program_id, name: program.name });
    }

    if (!hasScreening && isReadyToScreen(updatedProfile)) {
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
          onResolve={handleResolve}
          onRecheck={runScreen}
          screeningLoading={screeningLoading}
          resolving={resolving}
          onCancelResolve={() => setResolving(null)}
        />
      ) : (
        <RealtimeVoiceIntake clientId={clientId} lang={lang} onProfileUpdated={refreshRecord} />
      )}
    </div>
  );
}
