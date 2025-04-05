
import { useState, useEffect } from "react"
import ReactMarkdown from 'react-markdown'
import { SimpleScrollingContent } from "@/components/ui/simple-scrolling-content"

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
  const [previousContentLength, setPreviousContentLength] = useState(0)
  
  // Debug logging
  console.log(`AnalysisDisplay: Rendering with content length: ${content?.length || 0}, isStreaming: ${isStreaming}`);
  
  // Detect content changes and update streaming status
  useEffect(() => {
    const currentLength = content?.length || 0;
    const hasChanged = currentLength !== previousContentLength;
    
    if (hasChanged) {
      console.log(`AnalysisDisplay: Content changed from ${previousContentLength} to ${currentLength} chars`);
      setPreviousContentLength(currentLength);
      
      if (isStreaming) {
        setStreamStatus('streaming');
      }
    }
    
    // Update stream status when streaming state changes
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        console.log('AnalysisDisplay: Stream status changed to idle');
        setStreamStatus('idle');
      }
      return;
    }
    
    // If streaming but no content change, set up waiting detection
    if (isStreaming && !hasChanged) {
      const waitingTimeout = setTimeout(() => {
        // This will be triggered if no content updates happen for 1.5 seconds
        setStreamStatus('waiting');
        console.log('AnalysisDisplay: Stream status changed to waiting');
      }, 1500);
      
      return () => clearTimeout(waitingTimeout);
    }
  }, [isStreaming, content, streamStatus, previousContentLength]);

  if (!content) return null

  return (
    <div className="relative">
      <SimpleScrollingContent 
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full"
        maxHeight={maxHeight}
        shouldAutoScroll={shouldAutoScroll}
        isStreaming={isStreaming}
        onScrollAwayFromBottom={() => {
          console.log('AnalysisDisplay: User scrolled away from bottom');
          setShouldAutoScroll(false);
        }}
        onScrollToBottom={() => {
          console.log('AnalysisDisplay: User scrolled to bottom');
          setShouldAutoScroll(true);
        }}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {content}
          </ReactMarkdown>
        </div>
      </SimpleScrollingContent>
      
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
