"use client";

import { useEffect, useRef, useState } from "react";

// Normalized node positions within the flight stage (0–1 of stage w/h).
// A gentle zigzag gives the plane an interesting path to bank along.
const POINTS = [
  { fx: 0.1, fy: 0.32 },
  { fx: 0.37, fy: 0.66 },
  { fx: 0.63, fy: 0.32 },
  { fx: 0.9, fy: 0.66 },
];

// Smooth Catmull-Rom spline through the points, emitted as cubic beziers.
function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function HowItWorksSteps({
  steps,
}: {
  steps: { title: string; body: string }[];
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const maskRef = useRef<SVGPathElement>(null);
  const planeRef = useRef<SVGGElement>(null);

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [pathD, setPathD] = useState("");
  const [litCount, setLitCount] = useState(1);
  const [reduced, setReduced] = useState(false);

  const lenRef = useRef(0);
  const thresholdsRef = useRef<number[]>([]);
  const litRef = useRef(1);

  // Respect reduced-motion: fall back to a plain static grid, no pinning.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Measure the stage so SVG coords == pixel coords (viewBox matches size).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!dims.w || !dims.h) return;
    const pts = POINTS.map((p) => ({ x: p.fx * dims.w, y: p.fy * dims.h }));
    setPathD(buildPath(pts));
  }, [dims]);

  // Once the path exists, measure its length and find where each node sits
  // along it (as a 0–1 fraction) so we know when to light each one.
  useEffect(() => {
    const path = trailRef.current;
    if (!path || !pathD) return;
    const len = path.getTotalLength();
    lenRef.current = len;

    const pts = POINTS.map((p) => ({ x: p.fx * dims.w, y: p.fy * dims.h }));
    thresholdsRef.current = pts.map((pt) => {
      let best = 0;
      let bestDist = Infinity;
      const samples = 300;
      for (let i = 0; i <= samples; i++) {
        const l = (i / samples) * len;
        const q = path.getPointAtLength(l);
        const dist = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = l / len;
        }
      }
      return best;
    });

    if (maskRef.current) {
      maskRef.current.style.strokeDasharray = String(len);
      maskRef.current.style.strokeDashoffset = String(len);
    }
    update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathD, dims]);

  function update() {
    const wrap = wrapperRef.current;
    const path = trailRef.current;
    if (!wrap || !path || !pathD) return;

    // getPointAtLength throws on an empty path — bail until it has geometry.
    let len = lenRef.current;
    if (!len) {
      len = path.getTotalLength();
      lenRef.current = len;
    }
    if (!len) return;

    const scrollable = wrap.offsetHeight - window.innerHeight;
    const rect = wrap.getBoundingClientRect();
    const progress = scrollable > 0 ? Math.min(Math.max(-rect.top / scrollable, 0), 1) : 0;

    // Grow the revealed portion of the dotted trail up to the plane.
    if (maskRef.current) {
      maskRef.current.style.strokeDashoffset = String(len * (1 - progress));
    }

    // Move + bank the plane along the path.
    const l = progress * len;
    const a = path.getPointAtLength(l);
    const b = path.getPointAtLength(Math.min(l + 1, len));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (planeRef.current) {
      planeRef.current.setAttribute("transform", `translate(${a.x} ${a.y}) rotate(${angle})`);
    }

    // Light each node once the plane has reached it.
    const th = thresholdsRef.current;
    let count = 0;
    for (let i = 0; i < th.length; i++) {
      if (progress >= th[i] - 0.001) count++;
    }
    if (count !== litRef.current) {
      litRef.current = count;
      setLitCount(count);
    }
  }

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, pathD, dims]);

  if (reduced) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-white">How it works</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">From a sentence to a screened case</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {steps.map((step) => (
            <div key={step.title} className="rounded-xl border border-white/20 bg-white/5 p-6 text-base font-bold text-white">
              {step.title}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center px-6">
        <div className="mb-8 max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-white">How it works</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">From a sentence to a screened case</h2>
        </div>

        <div ref={stageRef} className="relative h-[60vh] w-full max-w-4xl">
          {dims.w > 0 && (
            <svg
              className="absolute inset-0 h-full w-full overflow-visible"
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <mask id="trail-reveal">
                  <path
                    ref={maskRef}
                    d={pathD}
                    fill="none"
                    stroke="white"
                    strokeWidth={14}
                    strokeLinecap="round"
                  />
                </mask>
              </defs>

              {/* faint full route so all four stops are hinted ahead */}
              <path
                d={pathD}
                fill="none"
                stroke="white"
                strokeOpacity={0.12}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="0.5 12"
              />

              {/* dotted trail, revealed up to the plane via the mask */}
              <path
                ref={trailRef}
                d={pathD}
                fill="none"
                stroke="#5eead4"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="0.5 12"
                mask="url(#trail-reveal)"
              />

              {/* paper plane, pointing +x so rotation matches travel */}
              <g ref={planeRef} className="drop-shadow-[0_0_6px_rgba(94,234,212,0.7)]">
                <path d="M -9 -7 L 12 0 L -9 7 L -4 0 Z" fill="#ccfbf1" />
              </g>
            </svg>
          )}

          {steps.map((step, i) => {
            const p = POINTS[i];
            const lit = i < litCount;
            const above = p.fy < 0.5;
            return (
              <div
                key={step.title}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }}
              >
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-500 ${
                    lit
                      ? "scale-110 border-teal-300 bg-teal-400/25 shadow-[0_0_24px_5px_rgba(94,234,212,0.5)]"
                      : "border-white/25 bg-white/5"
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-full transition-colors duration-500 ${
                      lit ? "bg-teal-200" : "bg-white/40"
                    }`}
                  />
                </div>
                <div
                  className={`absolute left-1/2 w-44 -translate-x-1/2 text-center text-sm font-bold transition-colors duration-500 ${
                    lit ? "text-white" : "text-white/40"
                  } ${above ? "bottom-full mb-3" : "top-full mt-3"}`}
                >
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
