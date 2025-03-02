
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'
import { useEffect, useRef } from 'react'

interface AnalysisDisplayProps {
  content: string;
  isStreaming?: boolean;
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when content changes if isStreaming is true
  useEffect(() => {
    if (isStreaming && scrollAreaRef.current) {
      // Using direct DOM manipulation for container-confined scrolling
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [content, isStreaming]);

  if (!content) return null;

  return (
    <div ref={scrollAreaRef} className="relative">
      <ScrollArea className="h-[200px] rounded-md border p-4 bg-accent/5">
        <ReactMarkdown className="text-sm prose prose-invert prose-sm max-w-none">
          {content}
        </ReactMarkdown>
        {isStreaming && content && (
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse mt-2" />
        )}
      </ScrollArea>
    </div>
  )
}
