import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-sm bg-muted px-1 py-0.5 text-xs tabular-nums">
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h3 className="mb-1.5 font-semibold text-foreground">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1.5 font-semibold text-foreground">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 font-semibold text-foreground">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
};

/** Renders the AI assistant's markdown-flavored answer (bold, lists, links)
 * with the app's design tokens instead of dumping raw asterisks as text. */
export function AnswerMarkdown({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
