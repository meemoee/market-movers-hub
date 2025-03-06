
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 break-words text-wrap-all">
      {children}
    </p>
  ),
  pre: ({ children }) => (
    <pre className="whitespace-pre-wrap break-words text-wrap-all my-3 bg-muted/30 rounded p-3 w-full overflow-x-auto">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isInline = !className
    return isInline ? (
      <code className="bg-muted/30 rounded px-1 py-0.5 text-wrap-all break-words">{children}</code>
    ) : (
      <code className="block w-full overflow-x-auto text-wrap-all break-words">{children}</code>
    )
  },
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mb-3 break-words text-wrap-all">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mb-2 break-words text-wrap-all">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold mb-2 break-words text-wrap-all">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 mb-3 space-y-1 break-words text-wrap-all">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 mb-3 space-y-1 break-words text-wrap-all">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="break-words text-wrap-all">{children}</li>
  ),
  a: ({ href, children }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="text-primary hover:text-primary/80 break-all text-wrap-all"
    >
      {children}
    </a>
  ),
}

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="w-full overflow-hidden">
      <ReactMarkdown
        components={markdownComponents}
        className="text-sm prose prose-invert prose-sm max-w-full w-full text-wrap-all"
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
