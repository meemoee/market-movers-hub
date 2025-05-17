import { useState, useRef, useCallback, useEffect } from 'react';

// Adjust this to control how fast content appears to stream
const ARTIFICIAL_DELAY = 2; // milliseconds between character displays (reduced for faster display)
const CHUNK_SIZE = 15; // Number of characters to reveal at once
const POLLING_INTERVAL = 50; // milliseconds to check for updates

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
  
  // Direct debug access for tracking processed content
  const processedCharsRef = useRef<number>(0);
  
  // Start streaming with reset state
  const startStreaming = useCallback(() => {
    console.log(`STREAMING: Starting streaming with new buffer...`);
    
    // Clear existing content and reset refs
    contentBuffer.current = '';
    displayPositionRef.current = 0;
    processedCharsRef.current = 0;
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
    
    // Start the typewriter effect interval with faster updates
    typewriterIntervalRef.current = window.setInterval(() => {
      // If we've caught up to the buffer, do nothing
      if (displayPositionRef.current >= contentBuffer.current.length) {
        return;
      }
      
      // Show CHUNK_SIZE characters at once for faster updates
      const prevPosition = displayPositionRef.current;
      const nextPosition = Math.min(
        prevPosition + CHUNK_SIZE,
        contentBuffer.current.length
      );
      
      // Update display position
      displayPositionRef.current = nextPosition;
      
      // Get the segment to display
      const visibleContent = contentBuffer.current.substring(0, nextPosition);
      
      // Update visible content - Force update React state
      setContent(visibleContent);
      
      const charsAdded = nextPosition - prevPosition;
      console.log(`TYPEWRITER: Added ${charsAdded} chars (${prevPosition} → ${nextPosition}). Content length now ${visibleContent.length}`);
      
      lastUpdateRef.current = Date.now();
    }, ARTIFICIAL_DELAY);
    
    // Regular polling interval to ensure content updates if typewriter falls behind
    intervalRef.current = window.setInterval(() => {
      if (isStreamingRef.current && displayPositionRef.current < contentBuffer.current.length) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateRef.current;
        
        // If it's been too long since the typewriter ran, force an update
        if (timeSinceLastUpdate > 200) {
          console.log(`STREAMING: Force update after delay of ${timeSinceLastUpdate}ms`);
          
          // Force display a larger chunk of content
          const nextPosition = Math.min(
            displayPositionRef.current + 50, // Show more during a delay
            contentBuffer.current.length
          );
          
          displayPositionRef.current = nextPosition;
          setContent(contentBuffer.current.substring(0, nextPosition));
          lastUpdateRef.current = now;
        }
      }
    }, POLLING_INTERVAL); // Check more frequently
  }, []);
  
  // Add a chunk to the stream with improved debugging
  const addChunk = useCallback((chunk: string) => {
    if (!isStreamingRef.current) {
      console.log(`STREAMING: Not streaming, ignoring chunk: "${chunk}"`);
      return;
    }
    
    // Log this chunk arrival with timestamp for debugging
    const now = Date.now();
    const chunkInfo = {
      timestamp: now,
      size: chunk.length,
      content: chunk
    };
    
    // Record chunk details for debugging
    chunksRef.current.push(chunkInfo);
    
    // Add the chunk to the buffer
    const oldLength = contentBuffer.current.length;
    contentBuffer.current += chunk;
    
    // Track processed characters
    processedCharsRef.current += chunk.length;
    
    console.log(`STREAMING: [${new Date(now).toISOString().substring(11, 23)}] Added chunk #${chunksRef.current.length} (${chunk.length} chars). Buffer: ${oldLength} → ${contentBuffer.current.length}`);
    console.log(`STREAMING: Chunk preview: "${chunk.substring(0, Math.min(50, chunk.length))}${chunk.length > 50 ? '...' : ''}"`);
    
    // Calculate how far behind the display is
    const displayLag = contentBuffer.current.length - displayPositionRef.current;
    
    // For the very first chunk or if significantly behind, update immediately
    if (oldLength === 0 || displayLag > 500) {
      // Get ahead by processing a chunk immediately
      let newPosition;
      
      if (oldLength === 0) {
        // For first chunk, show some content immediately
        newPosition = Math.min(30, contentBuffer.current.length);
      } else {
        // For catching up when behind, move forward significantly
        newPosition = displayPositionRef.current + Math.floor(displayLag / 2);
      }
      
      // Update position
      displayPositionRef.current = newPosition;
      
      // Force immediate update for UI
      const visibleContent = contentBuffer.current.substring(0, newPosition);
      setContent(visibleContent);
      
      console.log(`STREAMING: Force-updated position to ${newPosition}/${contentBuffer.current.length} (lag was ${displayLag})`);
      
      lastUpdateRef.current = Date.now();
    } else {
      // Otherwise let the typewriter handle it
      console.log(`STREAMING: Regular flow, position: ${displayPositionRef.current}/${contentBuffer.current.length}, lag: ${displayLag}`);
    }
  }, []);
  
  // Stop streaming and ensure full content is displayed immediately
  const stopStreaming = useCallback(() => {
    console.log(`STREAMING: Stopping streaming... Final buffer length: ${contentBuffer.current.length}`);
    console.log(`STREAMING: Received ${chunksRef.current.length} chunks in total`);
    
    // Log all chunks for debugging
    chunksRef.current.forEach((chunk, i) => {
      console.log(`STREAMING: Chunk #${i+1}: ${chunk.size} chars at ${new Date(chunk.timestamp).toISOString().substring(11, 23)}: "${chunk.content.substring(0, 20)}${chunk.content.length > 20 ? "..." : ""}"`);
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
    content,               // Currently visible content (may lag behind the buffer during streaming)
    rawBuffer: contentBuffer.current,  // Provide access to the raw buffer for debugging
    displayPosition: displayPositionRef.current, // Current display position
    isStreaming,           // Whether streaming is currently active
    startStreaming,        // Start streaming and reset state
    addChunk,              // Add a chunk to the stream
    stopStreaming          // Stop streaming and ensure full content is displayed
  };
}
