
import { useEffect } from 'react';

interface StreamTriggerOptions {
  isCurrentIteration: boolean;
  isStreaming: boolean;
  iteration: {
    streamStatus?: 'waiting' | 'streaming' | 'complete';
    results: any[];
    iteration: number;
  };
  onStartStream?: (iterationNumber: number) => void;
}

export function useStreamTrigger({
  isCurrentIteration,
  isStreaming,
  iteration,
  onStartStream
}: StreamTriggerOptions) {
  // Trigger direct streaming if needed and available
  useEffect(() => {
    if (isCurrentIteration && isStreaming && onStartStream && 
        iteration.streamStatus === 'waiting' && iteration.results && iteration.results.length > 0) {
      onStartStream(iteration.iteration);
    }
  }, [isCurrentIteration, isStreaming, iteration, onStartStream]);
}
