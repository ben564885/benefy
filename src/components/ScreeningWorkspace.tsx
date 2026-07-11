"use client";

import { useState } from "react";
import type { ChatMessage, ClientProfile, ClientRecord, ProgramDefinition, ScreeningResult, TraceStep } from "@/lib/types";
import ChatPanel from "@/components/ChatPanel";
import ProfilePanel from "@/components/ProfilePanel";
import RealtimeVoiceIntake from "@/components/RealtimeVoiceIntake";
import ResultsView from "@/components/ResultsView";

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

export default function ScreeningWorkspace({ clientId, initialRecord, initialChat, initialTrace, programs }: Props) {
  const [profile, setProfile] = useState<ClientProfile>(initialRecord.profile);
  const [screening, setScreening] = useState<ScreeningResult | null>(initialRecord.last_screening);
  const [chat, setChat] = useState<ChatMessage[]>(initialChat);
  const [trace, setTrace] = useState<TraceStep[]>(initialTrace);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [citations, setCitations] = useState<{ program_id: string; source: string; url: string }[]>([]);
  const [mode, setMode] = useState<"live_gradient_agent" | "live_inference" | "local_fallback" | null>(null);
  const [tab, setTab] = useState<"intake" | "results">(screening ? "results" : "intake");
  const [screening_loading, setScreeningLoading] = useState(false);
  const [intakeMode, setIntakeMode] = useState<"text" | "voice">("text");

  const readyToScreen = isReadyToScreen(profile);

  async function refreshRecord() {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (!res.ok) return;
    setProfile(data.client.profile);
    setScreening(data.client.last_screening);
    if (data.trace) setTrace(data.trace);
  }

  async function handleSend(message: string) {
    const res = await fetch(`/api/clients/${clientId}/intake`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (!res.ok) return;

    setChat((prev) => [
      ...prev,
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: data.assistant_reply, timestamp: new Date().toISOString() },
    ]);
    if (data.profile) setProfile(data.profile);
    if (data.trace) setTrace(data.trace);
    if (data.target === "navigator") {
      setExplanation(data.assistant_reply);
      setCitations(data.citations ?? []);
      setMode(data.mode ?? null);
    }
  }

  async function handleScreen() {
    setScreeningLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/screen`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return;
      setScreening(data.screening);
      setExplanation(data.explanation);
      setCitations(data.citations ?? []);
      setMode(data.mode ?? null);
      setTrace(data.trace ?? []);
      setTab("results");
    } finally {
      setScreeningLoading(false);
    }
  }

  function handleResolve(programId: string) {
    const result = screening?.results.find((r) => r.program_id === programId);
    const program = programs.find((p) => p.program_id === programId);
    setTab("intake");
    if (result && program) {
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Let's resolve ${program.name}: ${result.reason} What can you tell me?`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("intake")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "intake" ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Intake
        </button>
        <button
          onClick={() => setTab("results")}
          disabled={!screening}
          className={`px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
            tab === "results" ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Results {screening ? "" : "(screen first)"}
        </button>
      </div>

      {tab === "intake" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                onClick={() => setIntakeMode("text")}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  intakeMode === "text" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Text
              </button>
              <button
                onClick={() => setIntakeMode("voice")}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  intakeMode === "voice" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Voice (beta)
              </button>
            </div>
            {intakeMode === "text" ? (
              <ChatPanel messages={chat} onSend={handleSend} />
            ) : (
              <RealtimeVoiceIntake clientId={clientId} onProfileUpdated={refreshRecord} />
            )}
          </div>
          <div className="flex flex-col gap-4">
            <ProfilePanel profile={profile} readyToScreen={readyToScreen} />
            <button
              onClick={handleScreen}
              disabled={!readyToScreen || screening_loading}
              className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {screening_loading ? "Screening…" : "Check what I qualify for"}
            </button>
          </div>
        </div>
      )}

      {tab === "results" && screening && (
        <ResultsView
          clientId={clientId}
          screening={screening}
          programs={programs}
          explanation={explanation}
          citations={citations}
          mode={mode}
          trace={trace}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
