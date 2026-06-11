import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a markdown string for display. Centralized so the whole app gets one
 * consistent renderer (swap the engine here, nowhere else).
 *
 * react-markdown does NOT render raw HTML by default, so untrusted note bodies
 * can't inject scripts. remark-gfm adds tables, strikethrough, and task lists.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
