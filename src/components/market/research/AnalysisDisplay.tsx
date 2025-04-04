
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
  
  // Optimize scrolling with less frequent updates
  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer || !shouldAutoScroll) return

    const viewport = scrollContainer.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]')
    if (!viewport) {
      console.warn("AnalysisDisplay: Could not find scroll viewport element.");
      return;
    }
    
    const currentContentLength = content?.length || 0
    
    console.log(`AnalysisDisplay: AutoScroll check - current: ${currentContentLength}, prev: ${prevContentLength.current}, shouldScroll: ${shouldAutoScroll}`);
    
    // Auto-scroll if content is growing and user hasn't scrolled up
    if (currentContentLength > prevContentLength.current && shouldAutoScroll) {
      requestAnimationFrame(() => {
        // Use setTimeout to push scroll to the end of the event loop tick
        setTimeout(() => {
          if (viewport && shouldAutoScroll) { // Re-check viewport and shouldAutoScroll in case state changed
            console.log(`AnalysisDisplay: Attempting scroll - Viewport scrollHeight: ${viewport.scrollHeight}, clientHeight: ${viewport.clientHeight}, scrollTop: ${viewport.scrollTop}`);
            viewport.scrollTop = viewport.scrollHeight;
            console.log(`AnalysisDisplay: Scrolled viewport to bottom (after timeout) - new scrollTop: ${viewport.scrollTop}, scrollHeight: ${viewport.scrollHeight}`);
          }
        }, 0); 
      })
    }
    
    // Update stream status based on isStreaming prop
    if (isStreaming) {
      // Update last update time whenever content changes during streaming
      if (currentContentLength > prevContentLength.current) {
        setLastUpdateTime(Date.now())
      }
    }
    
    prevContentLength.current = currentContentLength
  }, [content, isStreaming, shouldAutoScroll])
  
  // Handle user scroll to disable auto-scroll
  useEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return

    const viewport = scrollContainer.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]')
    if (!viewport) {
      console.warn("AnalysisDisplay: Could not find scroll viewport element for event listener.");
      return;
    }

    const handleScroll = () => {
      // Calculate based on the viewport's properties
      const scrollThreshold = 30; // Pixels from bottom to consider "at bottom"
      const scrollPosition = viewport.scrollTop;
      const totalHeight = viewport.scrollHeight;
      const visibleHeight = viewport.clientHeight;
      
      // Check if scrollable at all
      if (totalHeight <= visibleHeight) {
        if (!shouldAutoScroll) {
          console.log(`AnalysisDisplay: Viewport not scrollable (height <= clientHeight), enabling auto-scroll.`);
          setShouldAutoScroll(true); // Re-enable if not scrollable
        }
        return; 
      }

      const isAtBottom = Math.abs((totalHeight - visibleHeight) - scrollPosition) < scrollThreshold;
      
      if (shouldAutoScroll !== isAtBottom) {
        console.log(`AnalysisDisplay: Scroll event - scrollHeight: ${totalHeight}, clientHeight: ${visibleHeight}, scrollTop: ${scrollPosition.toFixed(1)}. Auto-scroll changed to ${isAtBottom}`);
        setShouldAutoScroll(isAtBottom);
      }
    }
    
    // Add listener to the viewport
    viewport.addEventListener('scroll', handleScroll)
    // Cleanup function needs to reference the same viewport
    return () => {
      if (viewport) { // Check if viewport still exists on cleanup
        viewport.removeEventListener('scroll', handleScroll)
      }
    }
  }, [shouldAutoScroll]) // Add shouldAutoScroll dependency to ensure the listener uses the latest state
  
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
            const scrollContainer = scrollRef.current;
            if (scrollContainer) {
              const viewport = scrollContainer.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
              if (viewport) {
                // Scroll the viewport to the bottom
                viewport.scrollTop = viewport.scrollHeight;
                console.log(`AnalysisDisplay: Manually scrolled viewport to bottom - height: ${viewport.scrollHeight}`);
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
