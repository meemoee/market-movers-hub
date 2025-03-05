
import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

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
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  
  // Optimize scrolling by using requestAnimationFrame
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    
    // Only auto-scroll if content is growing (new chunks arriving)
    // or if we're explicitly in streaming mode
    if (currentContentLength > prevContentLength.current || isStreaming) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
        // Batch state updates to reduce rendering overhead
        setLastUpdateTime(Date.now())
      })
      
      if (isStreaming) {
        setStreamStatus('streaming')
      }
    }
    
    prevContentLength.current = currentContentLength
  }, [content, isStreaming, shouldAutoScroll])
  
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
  
  // Check for inactive streaming periods with reduced frequency (optimized)
  useEffect(() => {
    if (!isStreaming) {
      setStreamStatus('idle')
      return
    }
    
    // Monitor for inactive streaming with longer interval to reduce overhead
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime
      if (timeSinceUpdate > 2000) { // If no updates for 2+ seconds
        setStreamStatus('waiting')
      } else if (streamStatus !== 'streaming') {
        setStreamStatus('streaming')
      }
    }, 1000) // Check once per second
    
    return () => clearInterval(interval)
  }, [isStreaming, lastUpdateTime, streamStatus])
  
  // Optimize continuous scroll during streaming
  useEffect(() => {
    if (!isStreaming || !scrollRef.current || !shouldAutoScroll) return
    
    let rafId: number
    
    const scrollToBottom = () => {
      if (scrollRef.current && shouldAutoScroll) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        rafId = requestAnimationFrame(scrollToBottom)
      }
    }
    
    rafId = requestAnimationFrame(scrollToBottom)
    
    return () => cancelAnimationFrame(rafId)
  }, [isStreaming, shouldAutoScroll])

  if (!content) return null

  return (
    <div className="relative">
      <ScrollArea 
        className={`rounded-md border p-4 bg-accent/5`}
        style={{ height: maxHeight }}
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
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {streamStatus === 'waiting' ? "Waiting for data..." : "Streaming..."}
            </span>
            <div className="flex space-x-1">
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-150' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-300' : 'bg-muted-foreground'}`} />
            </div>
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
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  )
}
