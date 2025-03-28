
import { useEffect } from 'react';

export function useAutoCollapse(
  isStreaming: boolean, 
  isCurrentIteration: boolean, 
  isExpanded: boolean, 
  isFinalIteration: boolean, 
  hasAnalysis: boolean,
  onToggleExpand: () => void
) {
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    if (!isStreaming && isCurrentIteration && isExpanded && !isFinalIteration && hasAnalysis) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        onToggleExpand();
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isCurrentIteration, isExpanded, isFinalIteration, hasAnalysis, onToggleExpand]);
}
