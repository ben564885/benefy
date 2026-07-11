"use client";

import { useEffect, useRef, useState } from "react";

function parseValue(raw: string) {
  const match = raw.match(/^([^\d]*)([\d,]*\.?\d*)(.*)$/);
  const prefix = match?.[1] ?? "";
  const numberPart = match?.[2] ?? "";
  const suffix = match?.[3] ?? "";
  const target = parseFloat(numberPart.replace(/,/g, "")) || 0;
  const decimals = numberPart.includes(".") ? numberPart.split(".")[1].length : 0;
  const useCommas = numberPart.includes(",");

  return { prefix, suffix, target, decimals, useCommas };
}

function formatNumber(value: number, decimals: number, useCommas: boolean) {
  const fixed = value.toFixed(decimals);
  if (!useCommas) return fixed;

  const [whole, frac] = fixed.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${withCommas}.${frac}` : withCommas;
}

export default function AnimatedStat({ value, label }: { value: string; label: string }) {
  const [display, setDisplay] = useState(() => {
    const { prefix, suffix, decimals, useCommas } = parseValue(value);
    return `${prefix}${formatNumber(0, decimals, useCommas)}${suffix}`;
  });
  const ref = useRef<HTMLParagraphElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimated.current) return;
        hasAnimated.current = true;

        const { prefix, suffix, target, decimals, useCommas } = parseValue(value);
        const duration = 1500;
        const start = performance.now();

        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = target * eased;
          setDisplay(`${prefix}${formatNumber(current, decimals, useCommas)}${suffix}`);
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div>
      <p ref={ref} className="text-4xl font-bold text-white">
        {display}
      </p>
      <p className="mt-2 text-sm font-bold text-white">{label}</p>
    </div>
  );
}
