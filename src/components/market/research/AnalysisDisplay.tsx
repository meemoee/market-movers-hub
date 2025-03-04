
import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Simple effect to scroll to bottom when content changes or during streaming
  useEffect(() => {
    if (!scrollRef.current || !content) return
    
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
    
    // Use requestAnimationFrame for smoother scrolling
    if (isStreaming) {
      const scrollFrame = requestAnimationFrame(scrollToBottom)
      return () => cancelAnimationFrame(scrollFrame)
    } else {
      scrollToBottom()
    }
  }, [content, isStreaming])
  
  if (!content) return null

  return (
    <div className="relative">
      <ScrollArea 
        className="h-[200px] rounded-md border p-4 bg-accent/5"
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2">
            {content}
          </ReactMarkdown>
        </div>
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
