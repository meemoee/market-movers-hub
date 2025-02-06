import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import "katex/dist/katex.min.css";  // Import KaTeX CSS

interface AnalysisDisplayProps {
  content: string
}

export function AnalysisDisplay({ content }: AnalysisDisplayProps) {
  if (!content) return null;

  return (
    <ScrollArea className="h-[200px] rounded-md border p-4 bg-accent/5">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className="text-sm prose prose-invert prose-sm max-w-none"
      >
        {content}
      </ReactMarkdown>
    </ScrollArea>
  )
}
