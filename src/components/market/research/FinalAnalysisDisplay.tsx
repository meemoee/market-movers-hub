
import { cn } from "@/lib/utils"
import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface FinalAnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: number
}

export function FinalAnalysisDisplay({ content, isStreaming = false, maxHeight }: FinalAnalysisDisplayProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const contentEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (contentEndRef.current && scrollAreaRef.current && isStreaming) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [content, isStreaming]);

  return (
    <div 
      className={cn(
        "final-analysis-display relative rounded-md border p-4 bg-card text-card-foreground max-w-full w-full overflow-hidden",
        maxHeight ? "overflow-auto" : ""
      )}
      style={maxHeight ? { maxHeight: `${maxHeight}px` } : {}}
      ref={scrollAreaRef}
    >
      <ScrollArea className={cn("w-full", maxHeight ? `h-[${maxHeight}px]` : "")}>
        <div className="prose prose-sm dark:prose-invert max-w-full">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-2 py-1 text-primary animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Generating analysis...</span>
          </div>
        )}
        <div ref={contentEndRef} />
      </ScrollArea>
    </div>
  )
}
