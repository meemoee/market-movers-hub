
import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
  reasoning?: string
  showReasoning?: boolean
}

export function AnalysisDisplay({ 
  content, 
  isStreaming = false, 
  maxHeight = "200px",
  reasoning,
  showReasoning = false
}: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const prevReasoningLength = useRef(reasoning?.length || 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const [activeTab, setActiveTab] = useState<'content' | 'reasoning'>(showReasoning ? 'reasoning' : 'content')
  
  // Debug logging
  useEffect(() => {
    if (content && content.length > 0) {
      console.log(`AnalysisDisplay: Content updated - length: ${content.length}, isStreaming: ${isStreaming}`);
    }
    if (reasoning && reasoning.length > 0) {
      console.log(`AnalysisDisplay: Reasoning updated - length: ${reasoning.length}`);
    }
  }, [content, reasoning, isStreaming]);
  
  // Optimize scrolling with less frequent updates
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    const currentReasoningLength = reasoning?.length || 0
    const activeContent = activeTab === 'content' ? content : reasoning
    const prevActiveLength = activeTab === 'content' ? prevContentLength.current : prevReasoningLength.current
    const currentActiveLength = activeTab === 'content' ? currentContentLength : currentReasoningLength
    
    console.log(`AnalysisDisplay: AutoScroll check - current ${activeTab}: ${currentActiveLength}, prev: ${prevActiveLength}, shouldScroll: ${shouldAutoScroll}`);
    
    // Only auto-scroll if content is growing or streaming
    if (currentActiveLength > prevActiveLength || isStreaming) {
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
    prevReasoningLength.current = currentReasoningLength
  }, [content, reasoning, isStreaming, shouldAutoScroll, activeTab])
  
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

  const displayContent = activeTab === 'content' ? content : reasoning
  const hasReasoning = reasoning && reasoning.length > 0

  if (!content && !reasoning) return null

  return (
    <div className="relative">
      {hasReasoning && (
        <div className="flex space-x-2 mb-2">
          <button 
            onClick={() => setActiveTab('reasoning')}
            className={`px-3 py-1 text-xs rounded-md ${activeTab === 'reasoning' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Reasoning
          </button>
          <button 
            onClick={() => setActiveTab('content')}
            className={`px-3 py-1 text-xs rounded-md ${activeTab === 'content' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Final Analysis
          </button>
        </div>
      )}
      
      <ScrollArea 
        className={`rounded-md border p-4 bg-accent/5 w-full max-w-full`}
        style={{ height: maxHeight }}
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {displayContent || "Waiting for data..."}
          </ReactMarkdown>
        </div>
      </ScrollArea>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {streamStatus === 'waiting' ? "Waiting for data..." : `Streaming ${activeTab === 'reasoning' ? 'reasoning' : 'analysis'}...`}
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
