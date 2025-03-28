
import { AnalysisDisplay } from "./AnalysisDisplay"

interface IterationAnalysisTabProps {
  analysis: string;
  reasoning?: string;
  isAnalysisStreaming: boolean;
  isReasoningStreaming: boolean;
}

export function IterationAnalysisTab({ 
  analysis, 
  reasoning, 
  isAnalysisStreaming, 
  isReasoningStreaming 
}: IterationAnalysisTabProps) {
  return (
    <AnalysisDisplay 
      content={analysis || "Analysis in progress..."} 
      reasoning={reasoning}
      isStreaming={isAnalysisStreaming}
      isReasoningStreaming={isReasoningStreaming}
      maxHeight="100%"
    />
  );
}
