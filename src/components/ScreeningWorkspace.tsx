"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile, ClientRecord, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import ChatPanel, { type ThreadItem } from "@/components/ChatPanel";
import RealtimeVoiceIntake from "@/components/RealtimeVoiceIntake";

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

  async function refreshRecord() {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (!res.ok) return;
    setProfile(data.client.profile);
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
        citations: data.citations ?? [],
        mode: data.mode ?? null,
        trace: data.trace ?? [],
      };
      setThread((prev) => [...prev, resultsItem]);
      setHasScreening(true);
    } finally {
      setScreeningLoading(false);
    }
  }

  async function handleSend(message: string, guided?: boolean) {
    setThread((prev) => [
      ...prev,
      { kind: "message", message: { role: "user", content: message, timestamp: new Date().toISOString() } },
    ]);

    const res = await fetch(`/api/clients/${clientId}/intake`, {
      method: "POST",
      body: JSON.stringify({ message, guided: guided === true }),
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

    if (!hasScreening && isReadyToScreen(updatedProfile)) {
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
      <div className="flex w-fit gap-1 self-end rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
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

      {intakeMode === "text" ? (
        <ChatPanel
          thread={thread}
          profile={profile}
          clientId={clientId}
          programs={programs}
          onSend={handleSend}
          onResolve={handleResolve}
          onRecheck={runScreen}
          screeningLoading={screeningLoading}
        />
      ) : (
        <RealtimeVoiceIntake clientId={clientId} onProfileUpdated={refreshRecord} />
      )}
    </div>
  );
}
