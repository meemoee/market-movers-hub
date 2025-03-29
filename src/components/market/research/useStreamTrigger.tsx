
import { useEffect } from 'react';

interface StreamTriggerOptions {
  isCurrentIteration: boolean;
  isStreaming: boolean;
  iteration: {
    results: any[];
    iteration: number;
  };
}

export function useStreamTrigger({
  isCurrentIteration,
  isStreaming,
  iteration
}: StreamTriggerOptions) {
  // Removed direct streaming trigger functionality
  // This hook is kept for backward compatibility but no longer triggers direct streams
  
  useEffect(() => {
    // No-op - streaming now happens solely through the background job and Realtime
  }, [isCurrentIteration, isStreaming, iteration]);
}
