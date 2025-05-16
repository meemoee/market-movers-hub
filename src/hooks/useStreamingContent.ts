import { useState, useRef, useCallback, useEffect } from 'react';

// Adjust this to control how fast content appears to stream
const ARTIFICIAL_DELAY = 10; // milliseconds between character displays (reduced for faster display)

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

  // Track last update for debugging
  const lastUpdateRef = useRef<number>(0);
  
  // Debug state to keep track of chunks received
  const chunksRef = useRef<{timestamp: number, size: number, content: string}[]>([]);
  
  // Start streaming with reset state
  const startStreaming = useCallback(() => {
    console.log(`STREAMING: Starting streaming with new buffer...`);
    
    // Clear existing content and reset refs
    contentBuffer.current = '';
    displayPositionRef.current = 0;
    setContent('');
    chunksRef.current = [];
    
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
      
      // Display the next character(s)
      const nextPosition = Math.min(
        displayPositionRef.current + 5, // Show 5 characters at a time for smoother display
        contentBuffer.current.length
      );
      
      // Update display position
      displayPositionRef.current = nextPosition;
      
      // Update visible content
      const visibleContent = contentBuffer.current.substring(0, nextPosition);
      setContent(visibleContent);
      
      lastUpdateRef.current = Date.now();
    }, ARTIFICIAL_DELAY);
    
    // Also set a regular polling interval to update content if chunks are delayed
    intervalRef.current = window.setInterval(() => {
      // Only update if streaming is active and there's new content
      if (isStreamingRef.current && displayPositionRef.current < contentBuffer.current.length) {
        const now = Date.now();
        
        // If it's been too long since the typewriter ran, force an update
        if (now - lastUpdateRef.current > 500) {
          console.log('STREAMING: Forcing update due to delay');
          
          // Force display a chunk of content
          const nextPosition = Math.min(
            displayPositionRef.current + 20,
            contentBuffer.current.length
          );
          
          displayPositionRef.current = nextPosition;
          setContent(contentBuffer.current.substring(0, nextPosition));
          lastUpdateRef.current = now;
        }
      }
    }, 500);
  }, []);
  
  // Add a chunk to the stream with improved debugging
  const addChunk = useCallback((chunk: string) => {
    if (!isStreamingRef.current) {
      console.log(`STREAMING: Not streaming, ignoring chunk: "${chunk}"`);
      return;
    }
    
    // Record chunk details for debugging
    chunksRef.current.push({
      timestamp: Date.now(),
      size: chunk.length,
      content: chunk.substring(0, 50) + (chunk.length > 50 ? "..." : "")
    });
    
    // Add the chunk to the buffer
    const oldLength = contentBuffer.current.length;
    contentBuffer.current += chunk;
    
    console.log(`STREAMING: [${new Date().toISOString().substring(11, 23)}] Added chunk (${chunk.length} chars). Buffer: ${oldLength} → ${contentBuffer.current.length}`);
    console.log(`STREAMING: Chunk content: "${chunk}"`);
    
    // Immediate update for very first chunk (for better UX)
    if (oldLength === 0 && chunk.length > 0) {
      const initialDisplayLength = Math.min(chunk.length, 10);
      displayPositionRef.current = initialDisplayLength;
      setContent(contentBuffer.current.substring(0, initialDisplayLength));
      lastUpdateRef.current = Date.now();
    }
  }, []);
  
  // Stop streaming and ensure full content is displayed immediately
  const stopStreaming = useCallback(() => {
    console.log(`STREAMING: Stopping streaming... Final buffer length: ${contentBuffer.current.length}`);
    console.log(`STREAMING: Received ${chunksRef.current.length} chunks in total`);
    
    // Log all chunks for debugging
    chunksRef.current.forEach((chunk, i) => {
      console.log(`STREAMING: Chunk #${i+1}: ${chunk.size} chars at ${new Date(chunk.timestamp).toISOString().substring(11, 23)}: "${chunk.content}"`);
    });
    
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
    
    console.log(`STREAMING: Set final content (${contentBuffer.current.length} characters)`);
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
