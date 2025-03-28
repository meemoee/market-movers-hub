
import { useEffect } from 'react'
import { cn } from "@/lib/utils"
import { ResearchResult } from "../SitePreviewList"
import { IterationCardHeader } from './IterationCardHeader'
import { IterationCardContent } from './IterationCardContent'
import { useAutoCollapse } from './useAutoCollapse'

export interface IterationProps {
  iteration: number;
  queries: string[];
  results: ResearchResult[];
  analysis: string;
  reasoning?: string;
  isAnalysisStreaming?: boolean;
  isReasoningStreaming?: boolean;
  streamStatus?: 'waiting' | 'streaming' | 'complete';
}

interface IterationCardProps {
  iteration: IterationProps;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming: boolean;
  isCurrentIteration: boolean;
  maxIterations: number;
  onStartStream?: (iterationNumber: number) => void;
}

export function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  isStreaming,
  isCurrentIteration,
  maxIterations,
  onStartStream
}: IterationCardProps) {
  const isFinalIteration = iteration.iteration === maxIterations
  
  // Use the custom hook for auto-collapse functionality
  useAutoCollapse(
    isStreaming, 
    isCurrentIteration, 
    isExpanded, 
    isFinalIteration, 
    !!iteration.analysis,
    onToggleExpand
  );

  // Determine streaming status based on individual properties
  const isAnalysisStreaming = isStreaming && isCurrentIteration && (iteration.isAnalysisStreaming !== false);
  const isReasoningStreaming = isStreaming && isCurrentIteration && (iteration.isReasoningStreaming !== false);

  // Trigger direct streaming if needed and available
  useEffect(() => {
    if (isCurrentIteration && isStreaming && onStartStream && 
        iteration.streamStatus === 'waiting' && iteration.results && iteration.results.length > 0) {
      onStartStream(iteration.iteration);
    }
  }, [isCurrentIteration, isStreaming, iteration, onStartStream]);

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      isCurrentIteration && isStreaming ? "border-primary/40" : "border-border"
    )}>
      <IterationCardHeader 
        iteration={iteration.iteration}
        resultsCount={iteration.results.length}
        isStreaming={isStreaming}
        isCurrentIteration={isCurrentIteration}
        isExpanded={isExpanded}
        isFinalIteration={isFinalIteration}
        onToggleExpand={onToggleExpand}
      />
      
      {isExpanded && (
        <IterationCardContent 
          analysis={iteration.analysis}
          reasoning={iteration.reasoning}
          results={iteration.results}
          queries={iteration.queries}
          isAnalysisStreaming={isAnalysisStreaming}
          isReasoningStreaming={isReasoningStreaming}
        />
      )}
    </div>
  );
}
