
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'
import { useEffect, useRef } from 'react'

interface AnalysisDisplayProps {
  content: string
}

export function AnalysisDisplay({ content }: AnalysisDisplayProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Auto-scroll to bottom when content updates
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }, 50);
      }
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className="w-full">
      <ScrollArea className="h-[200px] rounded-md border p-4 bg-accent/5" ref={scrollAreaRef}>
        <ReactMarkdown className="text-sm prose prose-invert prose-sm max-w-none">
          {content}
        </ReactMarkdown>
      </ScrollArea>
    </div>
  )
}
