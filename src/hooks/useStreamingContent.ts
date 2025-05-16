import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for handling streaming content with real-time updates
 * @returns An object with streaming state and methods to control it
 */
export function useStreamingContent() {
  // State to hold the current content
  const [content, setContent] = useState('');
  
  // State to track if streaming is active (for UI purposes)
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Ref to track streaming state (for immediate access in callbacks)
  const isStreamingRef = useRef(false);
  
  // Ref to hold the accumulated content (not subject to React's batching)
  const contentBuffer = useRef('');
  
  // Ref to hold the render interval ID
  const renderIntervalRef = useRef<number | null>(null);
  
  // Function to start streaming
  const startStreaming = useCallback(() => {
    console.log(`Starting streaming...`);
    // Clear existing content
    contentBuffer.current = '';
    setContent('');
    
    // Update both the ref and the state
    isStreamingRef.current = true;
    setIsStreaming(true);
    
    // Set up an interval to update the UI regularly
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
    }
    
    // Update the UI every 10ms while streaming for more responsive updates
    renderIntervalRef.current = window.setInterval(() => {
      console.log(`Interval update: Buffer length: ${contentBuffer.current.length}`);
      setContent(contentBuffer.current);
    }, 10);
  }, []);
  
  // Function to add a chunk to the stream
  const addChunk = useCallback((chunk: string) => {
    if (!isStreamingRef.current) {
      console.log(`Not streaming, ignoring chunk: "${chunk}"`);
      return;
    }
    
    // Add the chunk to the buffer
    contentBuffer.current += chunk;
    console.log(`Added chunk to buffer. Buffer length: ${contentBuffer.current.length}`);
  }, []); // Remove isStreaming from dependencies
  
  // Function to stop streaming
  const stopStreaming = useCallback(() => {
    console.log(`Stopping streaming... Final buffer length: ${contentBuffer.current.length}`);
    
    // Update both the ref and the state
    isStreamingRef.current = false;
    setIsStreaming(false);
    
    // Clear the interval
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
      renderIntervalRef.current = null;
      console.log(`Cleared interval`);
    }
    
    // Ensure the final content is set
    setContent(contentBuffer.current);
    console.log(`Set final content`);
  }, []);
  
  // Log when content changes
  useEffect(() => {
    console.log(`Content state updated. Length: ${content.length}`);
  }, [content]);
  
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
