import Image from "next/image";
import type { ReactNode } from "react";

const LOGOS: Record<string, { src: string; alt: string }> = {
  CalFresh: { src: "/logos/calfresh.jpg", alt: "CalFresh" },
  "PG&E CARE": { src: "/logos/pge.svg", alt: "PG&E" },
  "SFMTA Lifeline": { src: "/logos/muni.svg", alt: "SFMTA Muni" },
};

const iconProps = {
  viewBox: "0 0 16 16",
  className: "h-4 w-4 shrink-0 text-teal-700",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  "Deterministic eligibility engine": (
    <svg {...iconProps}>
      <path d="M2 12a6 6 0 1 1 12 0" />
      <path d="M8 12 10.5 8.5" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  "Gradient AI intake agent": (
    <svg {...iconProps} strokeWidth={1}>
      <path
        d="M8 2 9.1 6.1 13 7 9.1 7.9 8 12 6.9 7.9 3 7 6.9 6.1 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  ),
  "Human-in-the-loop review": (
    <svg {...iconProps}>
      <circle cx="6" cy="5" r="2.25" />
      <path d="M2 14c0-2.5 1.8-4 4-4s4 1.5 4 4" />
      <path d="M10.5 9.5 12 11l3-3" />
    </svg>
  ),
  "Pre-filled applications": (
    <svg {...iconProps}>
      <path d="M4 2h5l3 3v8.5a0.5 0.5 0 0 1-.5.5h-7a0.5 0.5 0 0 1-.5-.5V2.5A0.5 0.5 0 0 1 4 2Z" />
      <path d="M9 2v3h3" />
      <path d="M5.75 9 7 10.25 10 7.25" />
    </svg>
  ),
  "2026 FPL & AMI tables": (
    <svg {...iconProps}>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M2 7h12" />
      <path d="M6.5 3v10" />
    </svg>
  ),
  "Navigator agent": (
    <svg {...iconProps}>
      <circle cx="8" cy="8" r="6" />
      <path
        d="M10.3 5.7 9 9 5.7 10.3 7 7 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  ),
  "Guardrails on every response": (
    <svg {...iconProps}>
      <path d="M8 1.5 13 3.3v3.9c0 3.4-2.1 5.9-5 6.8-2.9-.9-5-3.4-5-6.8V3.3Z" />
      <path d="M5.5 8 7 9.5 10.5 6" />
    </svg>
  ),
  "Full eligibility trace": (
    <svg {...iconProps}>
      <circle cx="3.2" cy="3.2" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="12.8" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3.2 4.6v2.4a2 2 0 0 0 2 2h1.6a2 2 0 0 1 2 2v1.6" />
    </svg>
  ),
  "Zero guesswork": (
    <svg {...iconProps}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export default function PillIcon({ label }: { label: string }) {
  const logo = LOGOS[label];
  if (logo) {
    return (
      <span className="flex h-4 shrink-0 items-center">
        <Image
          src={logo.src}
          alt={logo.alt}
          width={40}
          height={16}
          className="h-4 w-auto object-contain"
          unoptimized
        />
      </span>
    );
  }

  return ICONS[label] ?? <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />;
}
