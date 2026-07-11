import type { ReactNode } from "react";

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, "");
}

interface Props {
  text: string;
  className?: string;
  linkClassName?: string;
}

export default function LinkifiedText({
  text,
  className,
  linkClassName = "underline underline-offset-2 hover:opacity-80",
}: Props) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    const raw = match[0];
    const href = trimTrailingPunctuation(raw);
    const trailing = raw.slice(href.length);
    nodes.push(
      <a key={start} href={href} target="_blank" rel="noreferrer" className={linkClassName}>
        {href}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <span className={className}>{nodes.length > 0 ? nodes : text}</span>;
}
