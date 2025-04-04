
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
  
  // Debug logging
  useEffect(() => {
    if (content && content.length > 0) {
      console.log(`AnalysisDisplay: Content updated - length: ${content.length}, isStreaming: ${isStreaming}`);
    }
  }, [content, isStreaming]);
  
  // More aggressive scrolling during streaming
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const viewportElement = scrollContainer.querySelector('[data-radix-scroll-area-viewport]')
    const currentContentLength = content?.length || 0
    
    console.log(`AnalysisDisplay: AutoScroll check - current: ${currentContentLength}, prev: ${prevContentLength.current}, shouldScroll: ${shouldAutoScroll}`);
    
    // Only auto-scroll if content is growing or streaming
    if (currentContentLength > prevContentLength.current || isStreaming) {
      if (viewportElement) {
        // Direct viewport access for more reliable scrolling
        requestAnimationFrame(() => {
          viewportElement.scrollTop = viewportElement.scrollHeight
          console.log(`AnalysisDisplay: Scrolled viewport to bottom - height: ${viewportElement.scrollHeight}`);
          setLastUpdateTime(Date.now())
        })
      } else {
        // Fallback to the container if viewport not found
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight
            console.log(`AnalysisDisplay: Scrolled container to bottom - height: ${scrollContainer.scrollHeight}`);
          }
          setLastUpdateTime(Date.now())
        })
      }
      
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
    const viewportElement = scrollContainer.querySelector('[data-radix-scroll-area-viewport]')
    
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      // If user has scrolled up, disable auto-scroll
      // If they scroll to the bottom, re-enable it
      const isAtBottom = Math.abs(
        (target.scrollHeight - target.clientHeight) - 
        target.scrollTop
      ) < 30 // Small threshold for "close enough" to bottom
      
      if (shouldAutoScroll !== isAtBottom) {
        console.log(`AnalysisDisplay: Auto-scroll changed to ${isAtBottom}`);
        setShouldAutoScroll(isAtBottom);
      }
    }
    
    if (viewportElement) {
      viewportElement.addEventListener('scroll', handleScroll)
      return () => viewportElement.removeEventListener('scroll', handleScroll)
    } else {
      scrollContainer.addEventListener('scroll', handleScroll)
      return () => scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [])
  
  // Check for inactive streaming with longer intervals
  useEffect(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        console.log(`AnalysisDisplay: Stream status changed to idle`);
        setStreamStatus('idle');
      }
      return;
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime
      const newStatus = timeSinceUpdate > 1500 ? 'waiting' : 'streaming';
      
      if (streamStatus !== newStatus) {
        console.log(`AnalysisDisplay: Stream status changed to ${newStatus}`);
        setStreamStatus(newStatus);
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isStreaming, lastUpdateTime, streamStatus])
  
  // For continuous smooth scrolling during active streaming
  useEffect(() => {
    if (!isStreaming || !scrollRef.current || !shouldAutoScroll) return
    
    console.log(`AnalysisDisplay: Setting up continuous scroll for streaming`);
    
    let rafId: number
    
    const scrollToBottom = () => {
      if (!scrollRef.current || !shouldAutoScroll) return
      
      const viewportElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      
      if (viewportElement) {
        viewportElement.scrollTop = viewportElement.scrollHeight
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
      
      rafId = requestAnimationFrame(scrollToBottom)
    }
    
    rafId = requestAnimationFrame(scrollToBottom)
    
    return () => {
      console.log(`AnalysisDisplay: Cleaning up continuous scroll`);
      cancelAnimationFrame(rafId);
    }
  }, [isStreaming, shouldAutoScroll])

  if (!content) return null

  return (
    <div className="relative">
      <ScrollArea 
        className={`rounded-md border p-4 bg-accent/5 w-full max-w-full`}
        style={{ height: maxHeight }}
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
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
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-75' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-150' : 'bg-muted-foreground'}`} />
            </div>
          </div>
        </div>
      )}
      
      {!shouldAutoScroll && isStreaming && (
        <button 
          onClick={() => {
            setShouldAutoScroll(true);
            if (scrollRef.current) {
              const viewportElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
              if (viewportElement) {
                viewportElement.scrollTop = viewportElement.scrollHeight
              } else {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }
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
