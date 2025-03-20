
import { useState, useEffect, useRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/Markdown"
import { cn } from "@/lib/utils"
import { Check, Eye, EyeOff } from "lucide-react"

interface AnalysisDisplayProps {
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
  isReasoningStreaming?: boolean;
  maxHeight?: string;
}

export function AnalysisDisplay({ 
  content, 
  reasoning,
  isStreaming = false,
  isReasoningStreaming = false,
  maxHeight = '400px'
}: AnalysisDisplayProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Auto-scroll to bottom when content is streaming
    if (isStreaming && contentRef.current) {
      const scrollElement = contentRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [content, isStreaming]);

  useEffect(() => {
    // Auto-scroll reasoning to bottom when streaming
    if (isReasoningStreaming && reasoningRef.current && showReasoning) {
      const scrollElement = reasoningRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [reasoning, isReasoningStreaming, showReasoning]);

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
              {content}
              {isStreaming && <span className="animate-pulse">▌</span>}
            </Markdown>
          </div>
        </ScrollArea>
      </div>
      
      {reasoning && (
        <div className={cn("h-full overflow-hidden", showReasoning ? "block" : "hidden")} ref={reasoningRef}>
          <ScrollArea className="h-full" style={{ maxHeight }}>
            <div className="p-2 bg-muted/20">
              <Markdown>
                {reasoning}
                {isReasoningStreaming && <span className="animate-pulse">▌</span>}
              </Markdown>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
