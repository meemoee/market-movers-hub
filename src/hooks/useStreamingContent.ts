import { useState, useRef, useCallback, useEffect } from 'react';

// Adjust these constants to control streaming behavior
const ARTIFICIAL_DELAY = 10; // milliseconds between character displays (increased for visibility)
const CHUNK_SIZE = 5; // Number of characters to reveal at once (reduced for more granular updates)
const POLLING_INTERVAL = 20; // milliseconds to check for updates (more frequent)
const MAX_CATCH_UP_RATE = 50; // Maximum characters to show at once during catch-up
const DEBUG_INTERVAL = 1000; // How often to print debug info

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
  const debugIntervalRef = useRef<number | null>(null);
  
  // Track timing information for debugging
  const lastUpdateRef = useRef<number>(0);
  const lastTypewriterUpdateRef = useRef<number>(0);
  const streamStartTimeRef = useRef<number>(0);
  
  // Track interval execution counts
  const typewriterTickCountRef = useRef<number>(0);
  const pollingTickCountRef = useRef<number>(0);
  
  // Debug state to keep track of chunks received
  const chunksRef = useRef<{timestamp: number, size: number, content: string}[]>([]);
  
  // Direct debug access for tracking processed content
  const processedCharsRef = useRef<number>(0);
  
  // Start streaming with reset state
  const startStreaming = useCallback(() => {
    console.log(`STREAMING: Starting streaming with new buffer at ${new Date().toISOString()}`);
    
    // Clear existing content and reset refs
    contentBuffer.current = '';
    displayPositionRef.current = 0;
    processedCharsRef.current = 0;
    typewriterTickCountRef.current = 0;
    pollingTickCountRef.current = 0;
    setContent('');
    chunksRef.current = [];
    streamStartTimeRef.current = Date.now();
    
    // Clear any existing intervals
    if (intervalRef.current) {
      console.log('STREAMING: Clearing existing polling interval');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (typewriterIntervalRef.current) {
      console.log('STREAMING: Clearing existing typewriter interval');
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    
    if (debugIntervalRef.current) {
      clearInterval(debugIntervalRef.current);
      debugIntervalRef.current = null;
    }
    
    // Update streaming state
    isStreamingRef.current = true;
    setIsStreaming(true);
    
    console.log(`STREAMING: Setting up typewriter interval with delay=${ARTIFICIAL_DELAY}ms, chunk=${CHUNK_SIZE}`);
    
    // Start the typewriter effect interval with controlled updates
    typewriterIntervalRef.current = window.setInterval(() => {
      typewriterTickCountRef.current++;
      const now = Date.now();
      const timeSinceLastTypewriter = now - lastTypewriterUpdateRef.current;

      // If we've caught up to the buffer, do nothing
      if (displayPositionRef.current >= contentBuffer.current.length) {
        if (typewriterTickCountRef.current % 10 === 0) {
          console.log(`TYPEWRITER[${typewriterTickCountRef.current}]: No update needed, already at position ${displayPositionRef.current}`);
        }
        return;
      }
      
      // Show CHUNK_SIZE characters at once for controlled updates
      const prevPosition = displayPositionRef.current;
      const nextPosition = Math.min(
        prevPosition + CHUNK_SIZE,
        contentBuffer.current.length
      );
      
      // Update display position
      displayPositionRef.current = nextPosition;
      
      // Get the segment to display
      const visibleContent = contentBuffer.current.substring(0, nextPosition);
      
      // Update visible content
      setContent(visibleContent);
      
      const charsAdded = nextPosition - prevPosition;
      console.log(`TYPEWRITER[${typewriterTickCountRef.current}]: Added ${charsAdded} chars (${prevPosition} → ${nextPosition}). Content length now ${visibleContent.length}`);
      
      // Track the update timing
      lastTypewriterUpdateRef.current = now;
      lastUpdateRef.current = now;
    }, ARTIFICIAL_DELAY);
    
    // Regular polling interval to ensure content updates if typewriter falls behind
    intervalRef.current = window.setInterval(() => {
      pollingTickCountRef.current++;
      
      if (isStreamingRef.current && displayPositionRef.current < contentBuffer.current.length) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateRef.current;
        
        // If it's been too long since the typewriter ran, force an update
        if (timeSinceLastUpdate > 200) {
          console.log(`POLLING[${pollingTickCountRef.current}]: Force update after delay of ${timeSinceLastUpdate}ms`);
          
          // Force display a calculated chunk based on how far behind we are
          const displayLag = contentBuffer.current.length - displayPositionRef.current;
          const catchUpSize = Math.min(MAX_CATCH_UP_RATE, Math.ceil(displayLag / 4));
          
          const nextPosition = Math.min(
            displayPositionRef.current + catchUpSize,
            contentBuffer.current.length
          );
          
          console.log(`POLLING: Catching up ${catchUpSize} chars (lag=${displayLag}), position: ${displayPositionRef.current} → ${nextPosition}`);
          
          displayPositionRef.current = nextPosition;
          setContent(contentBuffer.current.substring(0, nextPosition));
          lastUpdateRef.current = now;
        } else if (pollingTickCountRef.current % 10 === 0) {
          // Periodic status update for debugging
          console.log(`POLLING[${pollingTickCountRef.current}]: Position ${displayPositionRef.current}/${contentBuffer.current.length}, lag=${contentBuffer.current.length - displayPositionRef.current}`);
        }
      }
    }, POLLING_INTERVAL);
    
    // Set up debug interval to print status periodically
    debugIntervalRef.current = window.setInterval(() => {
      if (isStreamingRef.current) {
        const runtime = Date.now() - streamStartTimeRef.current;
        console.log(`STREAMING_DEBUG: Runtime=${(runtime/1000).toFixed(1)}s, Buffer=${contentBuffer.current.length}, Display=${displayPositionRef.current}, Typewriter ticks=${typewriterTickCountRef.current}, Polling ticks=${pollingTickCountRef.current}`);
      }
    }, DEBUG_INTERVAL);
    
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
    console.log(`STREAMING: Current display lag: ${displayLag} characters`);
    
    // For the very first chunk, show some content immediately to provide feedback
    if (oldLength === 0) {
      // For first chunk, show a small portion immediately
      const firstChunkPreview = Math.min(10, contentBuffer.current.length);
      displayPositionRef.current = firstChunkPreview;
      
      // Force immediate update for UI
      const visibleContent = contentBuffer.current.substring(0, firstChunkPreview);
      setContent(visibleContent);
      
      console.log(`STREAMING: First chunk - showing preview of ${firstChunkPreview} chars`);
      
      lastUpdateRef.current = Date.now();
      lastTypewriterUpdateRef.current = Date.now();
    }
    
    // Check if the typewriter interval is actually running by validating the tick count
    if (typewriterTickCountRef.current === 0 && chunksRef.current.length > 3) {
      console.warn(`STREAMING: WARNING - Typewriter may not be running! Tick count is still 0 after ${chunksRef.current.length} chunks`);
      
      // Try restarting the typewriter interval
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
      }
      
      console.log(`STREAMING: Restarting typewriter interval`);
      typewriterIntervalRef.current = window.setInterval(() => {
        typewriterTickCountRef.current++;
        
        // Only continue if there's content to display
        if (displayPositionRef.current >= contentBuffer.current.length) {
          return;
        }
        
        // Show characters at a controlled pace
        const prevPosition = displayPositionRef.current;
        const nextPosition = Math.min(
          prevPosition + CHUNK_SIZE,
          contentBuffer.current.length
        );
        
        displayPositionRef.current = nextPosition;
        const visibleContent = contentBuffer.current.substring(0, nextPosition);
        setContent(visibleContent);
        
        console.log(`TYPEWRITER[${typewriterTickCountRef.current}](restarted): ${prevPosition} → ${nextPosition}`);
        lastTypewriterUpdateRef.current = Date.now();
        lastUpdateRef.current = Date.now();
      }, ARTIFICIAL_DELAY);
    }
  }, []);
  
  // Stop streaming and ensure full content is displayed immediately
  const stopStreaming = useCallback(() => {
    const runtime = Date.now() - streamStartTimeRef.current;
    console.log(`STREAMING: Stopping streaming after ${(runtime/1000).toFixed(1)}s... Final buffer length: ${contentBuffer.current.length}`);
    console.log(`STREAMING: Received ${chunksRef.current.length} chunks, Typewriter ticks: ${typewriterTickCountRef.current}, Polling ticks: ${pollingTickCountRef.current}`);
    
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
    
    if (debugIntervalRef.current) {
      clearInterval(debugIntervalRef.current);
      debugIntervalRef.current = null;
    }
    
    // Force display of all content immediately
    setContent(contentBuffer.current);
    displayPositionRef.current = contentBuffer.current.length;
    
    console.log(`STREAMING: Set final content (${contentBuffer.current.length} characters)`);
  }, []);
  
  // Use requestAnimationFrame for smoother updates - experimental alternative to intervals
  useEffect(() => {
    let animationFrameId: number | null = null;
    let lastFrameTime = 0;
    const frameBudget = 1000 / 30; // target ~30fps
    
    const updateFrame = (timestamp: number) => {
      // Only run this during streaming
      if (!isStreamingRef.current) {
        animationFrameId = null;
        return;
      }
      
      // Calculate time since last frame
      const elapsed = timestamp - lastFrameTime;
      
      // If it's time for an update (based on our frame budget)
      if (elapsed > frameBudget && displayPositionRef.current < contentBuffer.current.length) {
        // Show some characters
        const prevPosition = displayPositionRef.current;
        const nextPosition = Math.min(
          prevPosition + CHUNK_SIZE,
          contentBuffer.current.length
        );
        
        if (nextPosition > prevPosition) {
          displayPositionRef.current = nextPosition;
          setContent(contentBuffer.current.substring(0, nextPosition));
          // Log less frequently to avoid console spam
          if (Math.random() < 0.1) {
            console.log(`RAF: Updated ${prevPosition} → ${nextPosition}`);
          }
          lastUpdateRef.current = Date.now();
        }
        
        lastFrameTime = timestamp;
      }
      
      // Continue the animation loop
      animationFrameId = requestAnimationFrame(updateFrame);
    };
    
    // Start the animation frame loop when streaming begins
    if (isStreaming && !animationFrameId) {
      console.log('STREAMING: Starting requestAnimationFrame loop');
      animationFrameId = requestAnimationFrame(updateFrame);
    }
    
    // Clean up the animation frame when streaming ends or component unmounts
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isStreaming]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
      }
      if (debugIntervalRef.current) {
        clearInterval(debugIntervalRef.current);
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
