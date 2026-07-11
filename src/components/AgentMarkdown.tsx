import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

// Renders assistant/agent text as markdown inside chat bubbles and the
// explanation panel. remark-breaks keeps single newlines as line breaks —
// the deterministic delta/fallback messages rely on them, and models often
// emit them too. User messages stay plain text; only agent output goes
// through here.
export default function AgentMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-teal-700 underline hover:text-teal-900"
            >
              {linkChildren}
            </a>
          ),
          code: ({ children: codeChildren }) => (
            <code className="rounded bg-slate-200/60 px-1 py-0.5 text-[0.85em]">{codeChildren}</code>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
