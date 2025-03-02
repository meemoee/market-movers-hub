
import { useLayoutEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  useLayoutEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
  }, [content]) // This will trigger whenever content changes, even partial updates

  if (!content) return null;

  return (
    <div className="relative">
      <ScrollArea 
        className="h-[200px] rounded-md border p-4 bg-accent/5"
        ref={scrollRef}
      >
        <ReactMarkdown className="text-sm prose prose-invert prose-sm max-w-none">
          {content}
        </ReactMarkdown>
      </ScrollArea>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex space-x-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-150" />
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-300" />
          </div>
        </div>
      )}
    </div>
  )
}
