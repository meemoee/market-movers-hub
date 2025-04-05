
import { useState } from "react"
import ReactMarkdown from 'react-markdown'
import { AutoScrollArea } from "@/components/ui/auto-scroll-area"

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
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  
  // Debug logging
  console.log(`AnalysisDisplay: Rendering with content length: ${content?.length || 0}, isStreaming: ${isStreaming}`);
  
  // Update stream status when streaming state changes
  useState(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        console.log('AnalysisDisplay: Stream status changed to idle');
        setStreamStatus('idle');
      }
      return;
    }
    
    // If streaming, set to streaming status
    if (streamStatus !== 'streaming') {
      console.log('AnalysisDisplay: Stream status changed to streaming');
      setStreamStatus('streaming');
    }
    
    // Set up an interval to detect pauses in streaming
    const interval = setInterval(() => {
      // This will be triggered if no content updates happen for 1.5 seconds
      setStreamStatus('waiting');
      console.log('AnalysisDisplay: Stream status changed to waiting');
    }, 1500);
    
    return () => clearInterval(interval);
  }, [isStreaming, content]);

  if (!content) return null

  return (
    <div className="relative">
      <AutoScrollArea 
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full"
        maxHeight={maxHeight}
        autoScroll={shouldAutoScroll}
        onScrolledAwayFromBottom={() => {
          console.log('AnalysisDisplay: User scrolled away from bottom');
          setShouldAutoScroll(false);
        }}
        onScrolledToBottom={() => {
          console.log('AnalysisDisplay: User scrolled to bottom');
          setShouldAutoScroll(true);
        }}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {content}
          </ReactMarkdown>
        </div>
      </AutoScrollArea>
      
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
          onClick={() => setShouldAutoScroll(true)}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  )
}
