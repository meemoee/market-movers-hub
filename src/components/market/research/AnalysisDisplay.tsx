
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
  
  const lastChunkRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shouldAutoScroll && anchorRef.current) {
      anchorRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [content, isStreaming, shouldAutoScroll]);
  
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
      
      if (shouldAutoScroll !== isAtBottom) {
        console.log(`AnalysisDisplay: Auto-scroll changed to ${isAtBottom}`);
        setShouldAutoScroll(isAtBottom);
      }
    }
    
    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
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
  

  if (!content) return null

  return (
    <div className="relative">
      <ScrollArea 
        className={`rounded-md border p-4 bg-accent/5 w-full max-w-full`}
        style={{ height: maxHeight, overflowAnchor: 'none' }}
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full max-w-full flex flex-col space-y-2">
          {content
            .split(/\n{2,}/)  // split on double newlines (paragraphs)
            .map((chunk, idx) => (
              <div key={idx}>
                <ReactMarkdown
                  className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full"
                  components={{ p: 'div' }} // avoid nested <p> inside <p>
                >
                  {chunk}
                </ReactMarkdown>
              </div>
            ))}
          <div ref={anchorRef} style={{ height: 1 }} />
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
