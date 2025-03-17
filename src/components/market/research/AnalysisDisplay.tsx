
import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  reasoning?: string
  isStreaming?: boolean
  maxHeight?: string | number
  showReasoning?: boolean
}

export function AnalysisDisplay({ 
  content, 
  reasoning,
  isStreaming = false, 
  maxHeight = "200px",
  showReasoning = false
}: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const [activeTab, setActiveTab] = useState<'content' | 'reasoning'>(showReasoning ? 'reasoning' : 'content')
  
  // Switch to display content when reasoning is done but content is still streaming
  useEffect(() => {
    if (isStreaming && reasoning && reasoning.length > 0 && activeTab === 'reasoning' && content && content.length > 10) {
      // If reasoning seems complete (ends with a complete sentence) and content is streaming
      if (reasoning.match(/[.!?]\s*$/) && content.length < 500) {
        setActiveTab('content');
      }
    }
  }, [reasoning, content, isStreaming, activeTab]);
  
  // Optimize scrolling with less frequent updates
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = (activeTab === 'content' ? content : reasoning)?.length || 0
    const prevLength = prevContentLength.current
    
    // Only auto-scroll if content is growing or streaming
    if (currentContentLength > prevLength || isStreaming) {
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
        setLastUpdateTime(Date.now())
      })
      
      if (isStreaming) {
        setStreamStatus('streaming')
      }
    }
    
    prevContentLength.current = currentContentLength
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
      
      setShouldAutoScroll(isAtBottom)
    }
    
    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])
  
  // Check for inactive streaming with longer intervals
  useEffect(() => {
    if (!isStreaming) {
      setStreamStatus('idle')
      return
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime
      if (timeSinceUpdate > 1500) { // Reduced from 2000ms to 1500ms
        setStreamStatus('waiting')
      } else if (streamStatus !== 'streaming') {
        setStreamStatus('streaming')
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isStreaming, lastUpdateTime, streamStatus])
  
  // For continuous smooth scrolling during active streaming
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

  if (!content && !reasoning) return null
  
  const displayContent = activeTab === 'content' ? content : reasoning;
  const hasReasoning = reasoning && reasoning.length > 0;

  return (
    <div className="relative">
      {hasReasoning && (
        <div className="flex items-center space-x-1 mb-2">
          <button 
            onClick={() => setActiveTab('reasoning')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'reasoning' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-accent/30 hover:bg-accent/40'
            }`}
          >
            Reasoning Process
          </button>
          <button 
            onClick={() => setActiveTab('content')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'content' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-accent/30 hover:bg-accent/40'
            }`}
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
            {displayContent || ''}
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
