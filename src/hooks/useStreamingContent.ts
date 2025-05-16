
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
    
    // We need regular updates to trigger effect in StreamingContentDisplay
    // but we'll update the state only with new content since last update
    let lastRenderLength = 0;
    
    renderIntervalRef.current = window.setInterval(() => {
      // Only update state if there's actually new content
      if (contentBuffer.current.length > lastRenderLength) {
        console.log(`Interval update: New content length: ${contentBuffer.current.length - lastRenderLength} characters`);
        
        // Update the state with the current buffer
        setContent(contentBuffer.current);
        
        // Track what we've rendered so far
        lastRenderLength = contentBuffer.current.length;
      }
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
    console.log(`Added chunk: "${chunk}". Buffer length now: ${contentBuffer.current.length}`);
  }, []); 
  
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
