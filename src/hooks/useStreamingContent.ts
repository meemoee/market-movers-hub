import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for handling streaming content with real-time updates
 * @returns An object with streaming state and methods to control it
 */
export function useStreamingContent() {
  // State to hold the current content
  const [content, setContent] = useState('');
  
  // State to track if streaming is active
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Ref to hold the accumulated content (not subject to React's batching)
  const contentBuffer = useRef('');
  
  // Ref to hold the render interval ID
  const renderIntervalRef = useRef<number | null>(null);
  
  // Function to start streaming
  const startStreaming = useCallback(() => {
    // Clear existing content
    contentBuffer.current = '';
    setContent('');
    setIsStreaming(true);
    
    // Set up an interval to update the UI regularly
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
    }
    
    // Update the UI every 50ms while streaming
    renderIntervalRef.current = window.setInterval(() => {
      setContent(contentBuffer.current);
    }, 50);
  }, []);
  
  // Function to add a chunk to the stream
  const addChunk = useCallback((chunk: string) => {
    if (!isStreaming) return;
    
    // Add the chunk to the buffer
    contentBuffer.current += chunk;
  }, [isStreaming]);
  
  // Function to stop streaming
  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    
    // Clear the interval
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
      renderIntervalRef.current = null;
    }
    
    // Ensure the final content is set
    setContent(contentBuffer.current);
  }, []);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (renderIntervalRef.current) {
        clearInterval(renderIntervalRef.current);
      }
    };
  }, []);
  
  return {
    content,
    isStreaming,
    startStreaming,
    addChunk,
    stopStreaming
  };
}
