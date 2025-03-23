
import React from 'react'
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/Markdown"
import { cn } from "@/lib/utils"

interface AnalysisDisplayProps {
  content: string
  reasoning?: string
  isStreaming?: boolean
  isReasoningStreaming?: boolean
  maxHeight?: string
  isComplete?: boolean
  streamingTimedOut?: boolean
}

export function AnalysisDisplay({ 
  content, 
  reasoning, 
  isStreaming = false,
  isReasoningStreaming = false,
  maxHeight = '300px',
  isComplete = false,
  streamingTimedOut = false
}: AnalysisDisplayProps) {
  // If both streaming states are false, but isStreaming is true, set both to true for backwards compatibility
  const showAnalysisStreaming = isStreaming && !isComplete && !streamingTimedOut;
  const showReasoningStreaming = isReasoningStreaming && !isComplete && !streamingTimedOut;
  
  const statusIndicator = () => {
    if (isComplete) {
      return <div className="text-xs text-green-500 mb-2">Analysis complete</div>;
    }
    
    if (streamingTimedOut) {
      return <div className="text-xs text-yellow-500 mb-2">Stream timed out - analysis may be incomplete</div>;
    }
    
    if (showAnalysisStreaming || showReasoningStreaming) {
      return <div className="text-xs text-blue-500 animate-pulse mb-2">Streaming analysis...</div>;
    }
    
    return null;
  };

  return (
    <div className="w-full max-w-full h-full flex flex-col">
      {statusIndicator()}
      
      <ScrollArea className={cn("rounded-md border p-3", `h-[${maxHeight}]`)}>
        <div className="prose prose-invert prose-sm max-w-none">
          <Markdown>
            {content || "Analysis not available yet."}
          </Markdown>
          
          {reasoning && (
            <>
              <div className="border-t border-border my-3 pt-2">
                <div className="text-xs text-muted-foreground mb-1 font-medium">Analysis Reasoning:</div>
                <Markdown>
                  {reasoning}
                </Markdown>
              </div>
            </>
          )}
          
          {showAnalysisStreaming && (
            <span className="animate-pulse inline-block h-4 w-4 relative -top-1">▌</span>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
