
import { useState, useRef, useCallback, useEffect } from 'react';

// Adjust this to control how fast content appears to stream
const ARTIFICIAL_DELAY = 50; // milliseconds between character displays

/**
 * Custom hook for handling streaming content with real-time updates
 * including artificial character-by-character rendering
 * 
 * @returns An object with streaming state and methods to control it
 */
export function useStreamingContent() {
  // State to hold the current visible content (what user sees)
  const [content, setContent] = useState('');
  
  // State to track if streaming is active (for UI purposes)
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Ref to track streaming state (for immediate access in callbacks)
  const isStreamingRef = useRef(false);
  
  // Ref to hold the full accumulated content (not subject to React's batching)
  const contentBuffer = useRef('');
  
  // Ref to hold the current position in the display queue
  const displayPositionRef = useRef(0);
  
  // Ref to hold interval IDs
  const intervalRef = useRef<number | null>(null);
  const typewriterIntervalRef = useRef<number | null>(null);
  
  // Start streaming with reset state
  const startStreaming = useCallback(() => {
    console.log(`Starting streaming with new buffer...`);
    
    // Clear existing content and reset refs
    contentBuffer.current = '';
    displayPositionRef.current = 0;
    setContent('');
    
    // Clear any existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    
    // Update streaming state
    isStreamingRef.current = true;
    setIsStreaming(true);
    
    // Start the typewriter effect interval
    typewriterIntervalRef.current = window.setInterval(() => {
      // If we've caught up to the buffer, do nothing
      if (displayPositionRef.current >= contentBuffer.current.length) {
        return;
      }
      
      // Display the next character
      const nextPosition = Math.min(
        displayPositionRef.current + 3, // Show 3 characters at a time for smoother display
        contentBuffer.current.length
      );
      
      // Update display position
      displayPositionRef.current = nextPosition;
      
      // Update visible content
      const visibleContent = contentBuffer.current.substring(0, nextPosition);
      setContent(visibleContent);
      
      console.log(`Typewriter update: ${displayPositionRef.current}/${contentBuffer.current.length} characters`);
    }, ARTIFICIAL_DELAY);
    
    // Also set a regular polling interval to update content if chunks are delayed
    intervalRef.current = window.setInterval(() => {
      // Only update if streaming is active and there's new content
      if (isStreamingRef.current && displayPositionRef.current < contentBuffer.current.length) {
        console.log(`Polling update: ${displayPositionRef.current}/${contentBuffer.current.length} characters`);
      }
    }, 500);
  }, []);
  
  // Add a chunk to the stream
  const addChunk = useCallback((chunk: string) => {
    if (!isStreamingRef.current) {
      console.log(`Not streaming, ignoring chunk: "${chunk}"`);
      return;
    }
    
    // Use a timestamp for detailed logging
    const timestamp = new Date().toISOString().substring(11, 23);
    
    // Add the chunk to the buffer
    const oldLength = contentBuffer.current.length;
    contentBuffer.current += chunk;
    
    console.log(`[${timestamp}] Added chunk (${chunk.length} chars). Buffer: ${oldLength} → ${contentBuffer.current.length}`);
    
    // For debugging, log the actual chunk content if it's short
    if (chunk.length < 50) {
      console.log(`Chunk content: "${chunk}"`);
    }
  }, []);
  
  // Stop streaming and ensure full content is displayed immediately
  const stopStreaming = useCallback(() => {
    console.log(`Stopping streaming... Final buffer length: ${contentBuffer.current.length}`);
    
    // Update streaming state
    isStreamingRef.current = false;
    setIsStreaming(false);
    
    // Clear intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    
    // Force display of all content immediately
    setContent(contentBuffer.current);
    displayPositionRef.current = contentBuffer.current.length;
    
    console.log(`Set final content (${contentBuffer.current.length} characters)`);
  }, []);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
      }
    };
  }, []);
  
  return {
    content,                // Currently visible content (may lag behind the buffer during streaming)
    rawBuffer: contentBuffer.current,  // Provide access to the raw buffer for debugging
    displayPosition: displayPositionRef.current, // Current display position
    isStreaming,            // Whether streaming is currently active
    startStreaming,         // Start streaming and reset state
    addChunk,               // Add a chunk to the stream
    stopStreaming           // Stop streaming and ensure full content is displayed
  };
}
