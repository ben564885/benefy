"use client";

import { useId } from "react";

export type VoiceOrbStatus = "idle" | "connecting" | "connected" | "error";

interface VoiceOrbProps {
  status: VoiceOrbStatus;
  /** Realtime audio energy (0-1) from mic/assistant, drives the flow amplitude. */
  level?: number;
  size?: number;
}

export default function VoiceOrb({ status, level = 0, size = 160 }: VoiceOrbProps) {
  const uid = useId();
  const filterId = `voice-orb-flow-${uid}`;
  const gradId = `voice-orb-fill-${uid}`;

  const energy = Math.min(1, level * 2.2);
  const isError = status === "error";
  const isLive = status === "connected" || status === "connecting";
  const displacement = 12 + energy * 26;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute inset-[-35%] rounded-full blur-3xl transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.55) 0%, rgba(13,148,136,0.22) 45%, transparent 72%)",
          opacity: isError ? 0.25 : status === "connected" ? 1 : status === "connecting" ? 0.7 : 0.4,
          transform: `scale(${1 + energy * 0.35})`,
        }}
      />
      <svg
        viewBox="0 0 200 200"
        width="100%"
        height="100%"
        className={`absolute inset-0 transition-opacity duration-300 ${isLive ? "animate-orb-spin" : ""}`}
        style={{ opacity: isError ? 0.85 : status === "idle" ? 0.75 : 1, transformOrigin: "50% 50%" }}
      >
        <defs>
          <radialGradient id={gradId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={isError ? "#fee2e2" : "#f0fdfa"} />
            <stop offset="45%" stopColor={isError ? "#f87171" : "#5eead4"} />
            <stop offset="100%" stopColor={isError ? "#b91c1c" : "#0d9488"} />
          </radialGradient>
          <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
            <feTurbulence type="fractalNoise" numOctaves={2} seed={4} result="noise">
              <animate
                attributeName="baseFrequency"
                dur={isLive ? "10s" : "36s"}
                values="0.014 0.018;0.021 0.013;0.015 0.022;0.014 0.018"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={displacement} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <circle cx="100" cy="100" r="70" fill={`url(#${gradId})`} filter={`url(#${filterId})`} />
      </svg>
    </div>
  );
}
