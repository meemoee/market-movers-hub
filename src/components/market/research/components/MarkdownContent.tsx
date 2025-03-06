
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 break-words whitespace-normal overflow-hidden">
      {children}
    </p>
  ),
  pre: ({ children }) => (
    <pre className="whitespace-pre-wrap break-words overflow-hidden my-3 bg-muted/30 rounded p-3">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isInline = !className
    return isInline ? (
      <code className="bg-muted/30 rounded px-1 py-0.5">{children}</code>
    ) : (
      <code className="block overflow-x-auto">{children}</code>
    )
  },
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mb-3 break-words">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mb-2 break-words">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold mb-2 break-words">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 mb-3 space-y-1 break-words">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 mb-3 space-y-1 break-words">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="break-words overflow-hidden">{children}</li>
  ),
}

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="max-w-full overflow-hidden">
      <ReactMarkdown
        components={markdownComponents}
        className="text-sm prose prose-invert prose-sm max-w-none overflow-hidden"
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
