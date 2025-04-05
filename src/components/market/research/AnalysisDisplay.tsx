
import { useState, useEffect } from "react"
import ReactMarkdown from 'react-markdown'
import { StreamingContentView } from "@/components/ui/streaming-content-view"

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
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const [previousContentLength, setPreviousContentLength] = useState(0)
  
  // Debug logging
  console.log(`AnalysisDisplay: Rendering with content length: ${content?.length || 0}, isStreaming: ${isStreaming}`);
  
  // Detect content changes and update streaming status
  useEffect(() => {
    if (content?.length !== previousContentLength) {
      console.log(`AnalysisDisplay: Content changed from ${previousContentLength} to ${content?.length || 0} chars`);
      setPreviousContentLength(content?.length || 0);
      
      if (isStreaming && streamStatus !== 'streaming') {
        setStreamStatus('streaming');
      }
    }
  }, [content, previousContentLength, isStreaming, streamStatus]);
  
  // If streaming but no content change for a while, set to waiting
  useEffect(() => {
    let waitingTimeout: ReturnType<typeof setTimeout> | null = null;
    
    if (isStreaming && streamStatus === 'streaming' && content?.length === previousContentLength) {
      waitingTimeout = setTimeout(() => {
        setStreamStatus('waiting');
        console.log('AnalysisDisplay: Stream status changed to waiting');
      }, 1500);
    }
    
    // Cleanup timeout
    return () => {
      if (waitingTimeout) {
        clearTimeout(waitingTimeout);
      }
    };
  }, [isStreaming, streamStatus, content, previousContentLength]);
  
  // When streaming stops, set to idle
  useEffect(() => {
    if (!isStreaming && streamStatus !== 'idle') {
      setStreamStatus('idle');
    }
  }, [isStreaming, streamStatus]);

  if (!content) return null

  return (
    <div className="relative">
      <StreamingContentView 
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full"
        maxHeight={maxHeight}
        shouldScrollToBottom={shouldScrollToBottom}
        isStreaming={isStreaming}
        onScrollAwayFromBottom={() => {
          console.log('AnalysisDisplay: User scrolled away from bottom');
          setShouldScrollToBottom(false);
        }}
        onScrollToBottom={() => {
          console.log('AnalysisDisplay: User scrolled to bottom');
          setShouldScrollToBottom(true);
        }}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {content}
          </ReactMarkdown>
        </div>
      </StreamingContentView>
      
      {isStreaming && (
        <div className="absolute bottom-2 left-2 z-10">
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
    </div>
  )
}
