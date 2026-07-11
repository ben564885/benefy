"use client";

import { useEffect, useRef, useState } from "react";
import VoiceOrb from "@/components/VoiceOrb";
import type { Lang } from "@/lib/i18n";

interface Props {
  clientId: string;
  lang?: Lang;
  onProfileUpdated: () => void;
}

type Status = "idle" | "connecting" | "connected" | "error";

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

export default function RealtimeVoiceIntake({ clientId, lang = "en", onProfileUpdated }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const [level, setLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);

  // Session instructions (including which language to speak) are fixed at
  // session-creation time, so a language switch mid-call reconnects with a
  // fresh session rather than talking past the setting.
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  function startMeter() {
    const meterData = new Uint8Array(64);
    const tick = () => {
      let next = 0;
      if (localAnalyserRef.current) {
        localAnalyserRef.current.getByteFrequencyData(meterData);
        next = Math.max(next, meterData.reduce((a, b) => a + b, 0) / meterData.length / 255);
      }
      if (remoteAnalyserRef.current) {
        remoteAnalyserRef.current.getByteFrequencyData(meterData);
        next = Math.max(next, meterData.reduce((a, b) => a + b, 0) / meterData.length / 255);
      }
      setLevel(next);
      meterRafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopMeter() {
    if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
    meterRafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    setLevel(0);
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
      default:
        break;
    }
  }

  async function connect() {
    setStatus("connecting");
    try {
      const sessionRes = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, lang }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || "Could not start voice session");
      const ephemeralKey: string = sessionData.client_secret;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        const remoteAnalyser = audioCtx.createAnalyser();
        remoteAnalyser.fftSize = 128;
        audioCtx.createMediaStreamSource(e.streams[0]).connect(remoteAnalyser);
        remoteAnalyserRef.current = remoteAnalyser;
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const localAnalyser = audioCtx.createAnalyser();
      localAnalyser.fftSize = 128;
      audioCtx.createMediaStreamSource(stream).connect(localAnalyser);
      localAnalyserRef.current = localAnalyser;
      startMeter();

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
    } catch {
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
    stopMeter();
    setStatus((s) => (s === "error" ? s : "idle"));
  }

  return (
    <div className="flex items-center justify-center" style={{ minHeight: "24rem" }}>
      <button
        type="button"
        onClick={() => (status === "connected" ? disconnect() : status !== "connecting" && connect())}
        aria-label={status === "connected" ? "End voice session" : "Start voice session"}
        className="cursor-pointer rounded-full focus:outline-none"
      >
        <VoiceOrb status={status} level={level} size={200} />
      </button>
    </div>
  );
}
