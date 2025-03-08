import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
}

export function AnalysisDisplay({ content }: AnalysisDisplayProps) {
  if (!content) return null;

  return (
    <ScrollArea className="h-[200px] rounded-md border p-4 bg-accent/5">
      <ReactMarkdown className="text-sm prose prose-invert prose-sm max-w-none">
        {content}
      </ReactMarkdown>
    </ScrollArea>
  )
}