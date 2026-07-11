"use client";

import { useEffect, useState } from "react";

const TYPE_SPEED_MS = 45;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function TypewriterHeadline({ text, className }: { text: string; className?: string }) {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? text.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, TYPE_SPEED_MS);
    return () => clearInterval(id);
  }, [text]);

  return (
    <h1 className={className} aria-label={text}>
      <span aria-hidden="true">
        {text.slice(0, count)}
        <span className="ml-0.5 inline-block h-[0.85em] w-[3px] -translate-y-[0.05em] animate-pulse bg-current align-middle" />
      </span>
    </h1>
  );
}
