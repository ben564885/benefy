"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  clientId: string;
  onProfileUpdated: () => void;
}

type Status = "idle" | "connecting" | "connected" | "error";

interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

// OpenAI Realtime event payloads aren't hand-typed here — the WebRTC data
// channel is a firehose of event types we only care about a handful of, and
// the exact field nesting for the ones we do care about (function-call id,
// transcript deltas) has shifted across API revisions. Every accessor below
// falls back gracefully instead of throwing on an unrecognized shape.
type RealtimeEvent = Record<string, unknown> & {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  delta?: string;
  transcript?: string;
  item?: {
    id?: string;
    transcript?: string;
    call?: { id?: string; name?: string; arguments?: string };
  };
};

export default function RealtimeVoiceIntake({ clientId, onProfileUpdated }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => disconnect();
  }, []);

  function appendLine(role: "user" | "assistant", text: string) {
    if (!text) return;
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { role, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });
  }

  async function runTool(name: string, args: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/clients/${clientId}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      });
      const data = await res.json().catch(() => ({}));
      onProfileUpdated();
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  function handleEvent(event: RealtimeEvent) {
    switch (event.type) {
      case "response.function_call_arguments.done": {
        const callId: string | undefined = event.call_id ?? event.item?.call?.id ?? event.item?.id;
        const name: string | undefined = event.name ?? event.item?.call?.name;
        const rawArgs: string = event.arguments ?? event.item?.call?.arguments ?? "{}";
        if (!name || !callId) break;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = {};
        }
        runTool(name, args).then((result) => {
          dcRef.current?.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result ?? {}),
              },
            }),
          );
          dcRef.current?.send(JSON.stringify({ type: "response.create" }));
        });
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const text = event.transcript ?? event.item?.transcript;
        if (text) appendLine("user", text);
        break;
      }
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        if (event.delta) appendLine("assistant", event.delta);
        break;
      }
      default:
        break;
    }
  }

  async function connect() {
    setError(null);
    setLines([]);
    setStatus("connecting");
    try {
      const sessionRes = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || "Could not start voice session");
      const ephemeralKey: string = sessionData.client_secret;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("open", () => setStatus("connected"));
      dc.addEventListener("message", (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {
          // ignore malformed/unrecognized events
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) throw new Error(`Realtime connection failed (${sdpRes.status})`);
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
      disconnect();
    }
  }

  function disconnect() {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioElRef.current) audioElRef.current.srcObject = null;
    audioElRef.current = null;
    setStatus((s) => (s === "error" ? s : "idle"));
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ minHeight: "20rem", maxHeight: "28rem" }}>
        {lines.length === 0 && (
          <p className="text-sm text-slate-400">
            Voice intake (beta) — tap Start talking and describe your household out loud. Requires microphone access.
          </p>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`flex ${l.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                l.role === "user" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {l.text}
            </div>
          </div>
        ))}
        {status === "connected" && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">Listening…</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3">
        <span className="truncate text-xs text-slate-400">
          {status === "connected"
            ? "Live"
            : status === "connecting"
              ? "Connecting…"
              : status === "error"
                ? error
                : "Not connected"}
        </span>
        {status === "connected" ? (
          <button
            onClick={disconnect}
            className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
          >
            End
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={status === "connecting"}
            className="shrink-0 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {status === "connecting" ? "Connecting…" : "Start talking"}
          </button>
        )}
      </div>
    </div>
  );
}
