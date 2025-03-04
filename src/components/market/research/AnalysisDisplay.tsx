
import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'
import { Loader2 } from 'lucide-react'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
}

export function AnalysisDisplay({ 
  content, 
  isStreaming = false, 
  maxHeight = "200px" 
}: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastChunkTime, setLastChunkTime] = useState<number | null>(null)
  
  // This effect handles scrolling when new content arrives
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    
    // Only auto-scroll if content is growing (new chunks arriving)
    // or if we're explicitly in streaming mode
    if (currentContentLength > prevContentLength.current || isStreaming) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
      setLastChunkTime(Date.now())
    }
    
    prevContentLength.current = currentContentLength
  }, [content, isStreaming, shouldAutoScroll]) // Track both content changes and streaming state
  
  // Handle user scroll to disable auto-scroll
  useEffect(() => {
    if (!scrollRef.current) return
    
    const scrollContainer = scrollRef.current
    const handleScroll = () => {
      // If user has scrolled up, disable auto-scroll
      // If they scroll to the bottom, re-enable it
      const isAtBottom = Math.abs(
        (scrollContainer.scrollHeight - scrollContainer.clientHeight) - 
        scrollContainer.scrollTop
      ) < 30 // Small threshold for "close enough" to bottom
      
      setShouldAutoScroll(isAtBottom)
    }
    
    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])
  
  // Continuously scroll during streaming when auto-scroll is enabled
  useEffect(() => {
    if (!isStreaming || !scrollRef.current || !shouldAutoScroll) return
    
    const interval = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 100)
    
    return () => clearInterval(interval)
  }, [isStreaming, shouldAutoScroll])
  
  // Log content changes to verify streaming is happening
  useEffect(() => {
    if (isStreaming && content && content.length > prevContentLength.current) {
      console.log(`Streaming content changed: +${content.length - prevContentLength.current} chars`);
      setLastChunkTime(Date.now());
    }
  }, [content, isStreaming]);

  if (!content) return null

  // Check if we're seeing stream activity
  const isStreamActive = isStreaming && lastChunkTime && (Date.now() - lastChunkTime < 3000);

  return (
    <div className="relative">
      <ScrollArea 
        className="rounded-md border p-4 bg-accent/5 transition-all duration-200"
        style={{ height: maxHeight }}
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 prose-code:bg-muted/30 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-pre:bg-muted/30 prose-pre:rounded prose-pre:p-3 prose-pre:my-3">
            {content}
          </ReactMarkdown>
        </div>
      </ScrollArea>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2 z-10">
          <div className={`flex items-center space-x-1 ${isStreamActive ? 'bg-primary/10' : 'bg-amber-500/10'} px-2 py-1 rounded-full transition-colors`}>
            <Loader2 className={`w-3 h-3 animate-spin ${isStreamActive ? 'text-primary' : 'text-amber-500'}`} />
            <span className={`text-xs ${isStreamActive ? 'text-primary' : 'text-amber-500'} font-medium`}>
              {isStreamActive ? 'Streaming...' : 'Waiting for data...'}
            </span>
          </div>
        </div>
      )}
      
      {!shouldAutoScroll && isStreaming && (
        <button 
          onClick={() => {
            setShouldAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-2 left-2 z-10 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1"
        >
          <span className="i-lucide-arrow-down w-3 h-3" />
          Resume scrolling
        </button>
      )}
    </div>
  )
}
