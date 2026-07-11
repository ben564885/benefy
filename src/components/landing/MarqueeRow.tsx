import PillIcon from "./PillIcon";

const rowStyles: Record<"left" | "right", string> = {
  left: "animate-marquee-left",
  right: "animate-marquee-right",
};

export default function MarqueeRow({
  items,
  direction,
}: {
  items: string[];
  direction: "left" | "right";
}) {
  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className={`flex w-max gap-3 ${rowStyles[direction]}`}>
        {doubled.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm"
          >
            <PillIcon label={item} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
