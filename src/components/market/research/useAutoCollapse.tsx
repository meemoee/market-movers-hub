
import { useEffect } from 'react';

interface AutoCollapseOptions {
  isStreaming: boolean;
  isCurrentIteration: boolean;
  isExpanded: boolean;
  isFinalIteration: boolean;
  analysis: string;
  onToggleExpand: () => void;
}

export function useAutoCollapse({
  isStreaming,
  isCurrentIteration,
  isExpanded,
  isFinalIteration,
  analysis,
  onToggleExpand
}: AutoCollapseOptions) {
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    if (!isStreaming && isCurrentIteration && isExpanded && !isFinalIteration && analysis) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        onToggleExpand();
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isCurrentIteration, isExpanded, isFinalIteration, analysis, onToggleExpand]);
}
