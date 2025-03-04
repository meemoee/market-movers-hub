
import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now())
  const [displayedContent, setDisplayedContent] = useState(content || '')
  
  // Update displayed content immediately when new content arrives
  useEffect(() => {
    // Only update if the content has actually changed
    if (content !== displayedContent) {
      setDisplayedContent(content);
      setLastUpdateTime(Date.now());
    }
  }, [content, displayedContent]);
  
  // Scroll to bottom when new content arrives during streaming
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = displayedContent?.length || 0
    
    // Always scroll to bottom during streaming or when content grows
    if (isStreaming || currentContentLength > prevContentLength.current) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
    
    prevContentLength.current = currentContentLength
  }, [displayedContent, isStreaming, lastUpdateTime])
  
  // Ensure continuous scrolling during streaming with requestAnimationFrame
  useEffect(() => {
    if (!isStreaming || !scrollRef.current) return
    
    let animationId: number;
    
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
      animationId = requestAnimationFrame(scrollToBottom);
    }
    
    animationId = requestAnimationFrame(scrollToBottom);
    
    return () => cancelAnimationFrame(animationId);
  }, [isStreaming])

  if (!displayedContent && !isStreaming) return null

  return (
    <div className="relative">
      <ScrollArea 
        className="h-[200px] rounded-md border p-4 bg-accent/5"
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full prose-pre:whitespace-pre-wrap">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2">
            {displayedContent || (isStreaming ? 'Loading analysis...' : '')}
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
