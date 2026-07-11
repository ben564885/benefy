"use client";

import { useEffect, useRef, useState } from "react";

const ICONS = [
  // chat bubble
  <path key="chat" strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.06 0-2.077-.163-3.02-.463L3 21l1.516-4.05C3.546 15.607 3 13.86 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />,
  // sparkles
  <path key="sparkle" strokeLinecap="round" strokeLinejoin="round" d="M9.5 3v3m0 12v3m-6-9h3m12 0h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12m0-14.14-2.12 2.12m-9.9 9.9-2.12 2.12M14.5 9.5 12 15l-2.5-5.5L15 12l-5.5-2.5Z" />,
  // shield check
  <path key="shield" strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6v6c0 4.5 3 7.5 7.5 9 4.5-1.5 7.5-4.5 7.5-9V6L12 3Zm-2.5 9 1.8 1.8L15 10" />,
  // dollar sign
  <path key="dollar" strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m4-14.5c0-1.657-1.79-3-4-3s-4 1.343-4 3 1.79 3 4 3 4 1.343 4 3-1.79 3-4 3-4-1.343-4-3" />,
];

export default function HowItWorksSteps({
  steps,
}: {
  steps: { title: string; body: string }[];
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative mx-auto mt-16 max-w-2xl">
      <div
        className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent"
        aria-hidden
      />

      <div className="flex flex-col gap-10">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="group relative flex items-start gap-6 transition-all duration-700 ease-out"
            style={{
              transitionDelay: `${i * 120}ms`,
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(-24px)",
            }}
          >
            <div className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/10 shadow-lg backdrop-blur-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-teal-300/60">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                className="h-7 w-7 text-teal-200"
              >
                {ICONS[i % ICONS.length]}
              </svg>
              <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white shadow">
                {i + 1}
              </span>
            </div>

            <div className="pt-3">
              <h3 className="text-base font-bold text-white">{step.title}</h3>
              <p className="mt-2 text-sm font-bold text-white/80">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
