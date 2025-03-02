
import { useLayoutEffect, useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  
  // This effect handles scrolling when new content arrives
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    
    // Only auto-scroll if content is growing (new chunks arriving)
    // or if we're explicitly in streaming mode
    if (currentContentLength > prevContentLength.current || isStreaming) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
    
    prevContentLength.current = currentContentLength
  }, [content, isStreaming]) // Track both content changes and streaming state
  
  // Continuously scroll during streaming
  useEffect(() => {
    if (!isStreaming || !scrollRef.current) return
    
    const interval = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 100)
    
    return () => clearInterval(interval)
  }, [isStreaming])

  if (!content) return null

  return (
    <div className="relative w-full overflow-hidden">
      <ScrollArea 
        className="h-[200px] rounded-md border p-4 bg-accent/5 max-w-full"
        ref={scrollRef}
      >
        <div className="max-w-full break-words">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm max-w-none overflow-hidden break-words">
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
