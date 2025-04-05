import { useLayoutEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface StreamingAnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
}

export function StreamingAnalysisDisplay({ 
  content, 
  isStreaming = false, 
  maxHeight = "200px" 
}: StreamingAnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null) // Ref for the scrollable viewport element

  useLayoutEffect(() => {
    // Only scroll if streaming is active and the ref is attached
    if (isStreaming && scrollRef.current) {
      const scrollContainer = scrollRef.current;
      // Use requestAnimationFrame for smoother scrolling after render
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        console.log(`StreamingAnalysisDisplay: Scrolled to bottom - height: ${scrollContainer.scrollHeight}`);
      });
    }
  }, [content, isStreaming]) // Re-run effect when content changes or streaming status changes

  if (!content) return null

  return (
    <div className="relative h-full w-full">
      <ScrollArea 
        className="rounded-md border p-4 bg-accent/5 w-full h-full"
        style={{ maxHeight }} // Use maxHeight if provided, otherwise defaults from className
        ref={scrollRef} // Pass the ref directly to ScrollArea
      >
        {/* The direct child of ScrollArea is the content */}
        <div className="overflow-x-hidden w-full max-w-full"> 
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {content}
          </ReactMarkdown>
        </div>
      </ScrollArea>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              Streaming...
            </span>
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-75" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse delay-150" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
