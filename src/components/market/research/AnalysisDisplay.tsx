
import { useState, useEffect, useRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/Markdown"
import { cn } from "@/lib/utils"
import { Check, Eye } from "lucide-react"

interface AnalysisDisplayProps {
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
  isReasoningStreaming?: boolean;
  maxHeight?: string;
  onStreamEnd?: () => void;
}

export function AnalysisDisplay({ 
  content, 
  reasoning,
  isStreaming = false,
  isReasoningStreaming = false,
  maxHeight = '400px',
  onStreamEnd
}: AnalysisDisplayProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);
  
  // Store the incoming content with clear separation
  const [renderedContent, setRenderedContent] = useState(content || '');
  const [renderedReasoning, setRenderedReasoning] = useState(reasoning || '');
  
  // Track the last streaming state to detect when streaming ends
  const lastAnalysisStreamingState = useRef(isStreaming);
  const lastReasoningStreamingState = useRef(isReasoningStreaming);
  
  // When content updates, only update the analysis content - ensure immediate update
  useEffect(() => {
    if (content !== undefined && content !== null) {
      setRenderedContent(content);
    }
  }, [content]);
  
  // When reasoning updates, only update the reasoning content - ensure immediate update
  useEffect(() => {
    if (reasoning !== undefined && reasoning !== null) {
      setRenderedReasoning(reasoning);
    }
  }, [reasoning]);

  // Call onStreamEnd when streaming process stops
  useEffect(() => {
    const analysisStreamingJustEnded = lastAnalysisStreamingState.current && !isStreaming;
    const reasoningStreamingJustEnded = lastReasoningStreamingState.current && !isReasoningStreaming;
    
    if (analysisStreamingJustEnded) {
      console.log("Analysis streaming ended");
      if (onStreamEnd && !isReasoningStreaming) {
        onStreamEnd();
      }
    }
    
    if (reasoningStreamingJustEnded) {
      console.log("Reasoning streaming ended");
      if (onStreamEnd && !isStreaming) {
        onStreamEnd();
      }
    }
    
    // Update refs to current state for next comparison
    lastAnalysisStreamingState.current = isStreaming;
    lastReasoningStreamingState.current = isReasoningStreaming;
  }, [isStreaming, isReasoningStreaming, onStreamEnd]);
  
  // Auto-scroll content when streaming - ensure immediate scroll on content update
  useEffect(() => {
    if ((isStreaming || content) && contentRef.current) {
      const scrollElement = contentRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [renderedContent, isStreaming, content]);

  // Auto-scroll reasoning when streaming - ensure immediate scroll on reasoning update
  useEffect(() => {
    if ((isReasoningStreaming || reasoning) && reasoningRef.current && showReasoning) {
      const scrollElement = reasoningRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [renderedReasoning, isReasoningStreaming, reasoning, showReasoning]);

  return (
    <div className="flex flex-col h-full">
      {reasoning && (
        <div className="flex justify-end mb-2">
          <ToggleGroup type="single" value={showReasoning ? "reasoning" : "analysis"} onValueChange={value => setShowReasoning(value === "reasoning")}>
            <ToggleGroupItem value="analysis" aria-label="Show analysis" className="text-xs px-2 py-1">
              <Check className="h-3 w-3 mr-1" />
              Analysis
            </ToggleGroupItem>
            <ToggleGroupItem value="reasoning" aria-label="Show reasoning" className="text-xs px-2 py-1">
              <Eye className="h-3 w-3 mr-1" />
              Reasoning
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      
      <div className={cn("h-full overflow-hidden", showReasoning ? "hidden" : "block")} ref={contentRef}>
        <ScrollArea className="h-full" style={{ maxHeight }}>
          <div className="p-2">
            <Markdown>
              {renderedContent || ''}
              {isStreaming && <span className="animate-pulse">▌</span>}
            </Markdown>
          </div>
        </ScrollArea>
      </div>
      
      {(reasoning || isReasoningStreaming) && (
        <div className={cn("h-full overflow-hidden", showReasoning ? "block" : "hidden")} ref={reasoningRef}>
          <ScrollArea className="h-full" style={{ maxHeight }}>
            <div className="p-2 bg-muted/20">
              <Markdown>
                {renderedReasoning || ''}
                {isReasoningStreaming && <span className="animate-pulse">▌</span>}
              </Markdown>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
