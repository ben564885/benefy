"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const LOGOS = [
  { src: "/logos/calfresh.png", alt: "CalFresh" },
  { src: "/logos/muni.svg", alt: "SFMTA Muni" },
  { src: "/logos/medi-cal.png", alt: "Medi-Cal" },
  { src: "/logos/ssa.png", alt: "Social Security Administration" },
  { src: "/logos/caleitc.png", alt: "CalEITC" },
  { src: "/logos/liheap.png", alt: "LIHEAP" },
  { src: "/logos/dahlia.avif", alt: "DAHLIA SF Housing" },
];

const PAGE_SIZE = 4;
const PAGE_COUNT = Math.ceil(LOGOS.length / PAGE_SIZE);
// Pad by wrapping back to the start so every page fills a full 2x2 grid,
// even though 7 doesn't divide evenly into pages of 4.
const PADDED_LOGOS = Array.from({ length: PAGE_COUNT * PAGE_SIZE }, (_, i) => LOGOS[i % LOGOS.length]);

const PAUSE_MS = 2800;
const SLIDE_MS = 700;

export default function ProgramLogos() {
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (PAGE_COUNT <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setPage((p) => (p + 1) % PAGE_COUNT), PAUSE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden">
      <div
        className="flex h-full ease-in-out"
        style={{
          width: `${PAGE_COUNT * 100}%`,
          transform: `translateX(-${(page * 100) / PAGE_COUNT}%)`,
          transitionProperty: "transform",
          transitionDuration: `${SLIDE_MS}ms`,
        }}
      >
        {Array.from({ length: PAGE_COUNT }, (_, pageIndex) => (
          <div
            key={pageIndex}
            className="grid h-full shrink-0 grid-cols-2 grid-rows-2 gap-8 p-4"
            style={{ width: `${100 / PAGE_COUNT}%` }}
          >
            {PADDED_LOGOS.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE).map((logo, i) => (
              <div key={`${logo.alt}-${pageIndex}-${i}`} className="flex items-center justify-center">
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={112}
                  height={112}
                  className="h-full w-full object-contain drop-shadow-lg"
                  unoptimized
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
