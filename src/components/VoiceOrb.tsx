"use client";

export type VoiceOrbStatus = "idle" | "connecting" | "connected" | "error";

interface VoiceOrbProps {
  status: VoiceOrbStatus;
  /** Realtime audio energy (0-1) from mic/assistant, drives glow intensity. */
  level?: number;
  size?: number;
}

export default function VoiceOrb({ status, level = 0, size = 160 }: VoiceOrbProps) {
  const glow = Math.min(1, level * 2.2);
  const isError = status === "error";
  const isLive = status === "connected" || status === "connecting";

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute inset-[-35%] rounded-full blur-3xl transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.55) 0%, rgba(13,148,136,0.22) 45%, transparent 72%)",
          opacity: isError ? 0.25 : status === "connected" ? 1 : status === "connecting" ? 0.7 : 0.4,
          transform: `scale(${1 + glow * 0.3})`,
        }}
      />
      <div
        className={`absolute inset-0 rounded-full ${isLive ? "animate-orb-spin" : ""}`}
        style={{
          background: "conic-gradient(from 0deg, transparent 0%, rgba(45,212,191,0.9) 25%, transparent 55%)",
          filter: "blur(6px)",
          opacity: isError ? 0.2 : 0.8,
        }}
      />
      <div
        className={`absolute inset-[6%] rounded-full ${isLive ? "animate-orb-spin-reverse" : ""}`}
        style={{
          background: "conic-gradient(from 130deg, transparent 0%, rgba(94,234,212,0.85) 30%, transparent 58%)",
          filter: "blur(5px)",
          opacity: isError ? 0.15 : 0.7,
        }}
      />
      <div
        className="absolute inset-[16%] rounded-full transition-transform duration-150 ease-out"
        style={{
          background: isError
            ? "radial-gradient(circle at 35% 30%, #fee2e2, #f87171 55%, #b91c1c 100%)"
            : "radial-gradient(circle at 35% 30%, #f0fdfa, #5eead4 45%, #0d9488 100%)",
          boxShadow: `0 0 ${18 + glow * 42}px rgba(13,148,136,${0.3 + glow * 0.35})`,
          transform: `scale(${1 + glow * 0.14})`,
        }}
      />
    </div>
  );
}
