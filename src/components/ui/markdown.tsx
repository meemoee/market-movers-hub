import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import rehypeKatex from 'rehype-katex'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  children: string
  className?: string
  components?: React.ComponentProps<typeof ReactMarkdown>['components']
}

export function Markdown({ children, className, components }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
      rehypePlugins={[rehypeKatex]}
      components={components}
      className={cn('prose prose-sm max-w-none', className)}
    >
      {children}
    </ReactMarkdown>
  )
}

export default Markdown
