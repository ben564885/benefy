import Image from "next/image";

const TOP_ROW = [
  { src: "/logos/calfresh.png", alt: "CalFresh" },
  { src: "/logos/muni.svg", alt: "SFMTA Muni" },
  { src: "/logos/medi-cal.png", alt: "Medi-Cal" },
  { src: "/logos/ssa.png", alt: "Social Security Administration" },
];

const BOTTOM_ROW = [
  { src: "/logos/caleitc.png", alt: "CalEITC" },
  { src: "/logos/liheap.png", alt: "LIHEAP" },
  { src: "/logos/dahlia.avif", alt: "DAHLIA SF Housing" },
];

function LogoRow({
  logos,
  speed,
}: {
  logos: { src: string; alt: string }[];
  speed: "animate-marquee-left" | "animate-marquee-right";
}) {
  return (
    <div className="relative h-20 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
      <div className={`flex w-max items-center gap-10 ${speed}`}>
        {[...logos, ...logos].map((logo, i) => (
          <div key={`${logo.alt}-${i}`} className="flex h-20 w-20 shrink-0 items-center justify-center">
            <Image
              src={logo.src}
              alt={logo.alt}
              width={80}
              height={80}
              className="h-full w-full object-contain drop-shadow-lg"
              unoptimized
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProgramLogos() {
  return (
    <div className="flex flex-col gap-4">
      <LogoRow logos={TOP_ROW} speed="animate-marquee-left" />
      <LogoRow logos={BOTTOM_ROW} speed="animate-marquee-right" />
    </div>
  );
}
