
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
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    
    console.log(`AnalysisDisplay: AutoScroll check - current: ${currentContentLength}, prev: ${prevContentLength.current}, shouldScroll: ${shouldAutoScroll}`);
    
    // Only auto-scroll if content is growing or streaming
    if (currentContentLength > prevContentLength.current || isStreaming) {
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
          console.log(`AnalysisDisplay: Scrolled to bottom - height: ${scrollContainer.scrollHeight}`);
        }
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
  
  // For continuous smooth scrolling during active streaming
  useEffect(() => {
    if (!isStreaming || !scrollRef.current || !shouldAutoScroll) return
    
    console.log(`AnalysisDisplay: Setting up continuous scroll for streaming`);
    
    let rafId: number
    
    const scrollToBottom = () => {
      if (scrollRef.current && shouldAutoScroll) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        rafId = requestAnimationFrame(scrollToBottom)
      }
    }
    
    rafId = requestAnimationFrame(scrollToBottom)
    
    return () => {
      console.log(`AnalysisDisplay: Cleaning up continuous scroll`);
      cancelAnimationFrame(rafId);
    }
  }, [isStreaming, shouldAutoScroll])

  // Process content to style reasoning sections differently
  function processContent(text: string) {
    if (!text) return null;
    
    // Check if the content contains reasoning sections
    if (text.includes('[Reasoning:')) {
      // Split content by reasoning sections using regex
      const segments = text.split(/(\[Reasoning:[^\]]*\])/g);
      
      return (
        <>
          {segments.map((segment, index) => {
            if (segment.startsWith('[Reasoning:')) {
              // Extract reasoning text and style it differently
              const reasoningText = segment.replace('[Reasoning:', '').replace(']', '').trim();
              return (
                <div key={`reason-${index}`} className="bg-blue-950/20 border border-blue-800/20 rounded-md p-2 my-2 text-xs">
                  <div className="text-blue-400 font-medium mb-1 text-xs">Reasoning:</div>
                  <div className="text-blue-100">{reasoningText}</div>
                </div>
              );
            }
            // Render regular content with markdown
            return (
              <ReactMarkdown key={`content-${index}`} className="break-words prose-p:my-1 prose-headings:my-2">
                {segment}
              </ReactMarkdown>
            );
          })}
        </>
      );
    } else {
      // If no reasoning sections, just render the markdown
      return (
        <ReactMarkdown className="break-words prose-p:my-1 prose-headings:my-2">
          {text}
        </ReactMarkdown>
      );
    }
  }

  if (!content) return null

  return (
    <div className="relative">
      <ScrollArea 
        className={`rounded-md border p-4 bg-accent/5 w-full max-w-full`}
        style={{ height: maxHeight }}
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <div className="text-sm prose prose-invert prose-sm max-w-full">
            {processContent(content)}
          </div>
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
