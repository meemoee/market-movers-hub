
import { useState, useRef, useCallback, useEffect } from 'react';

// Adjust these constants to control streaming behavior
const CHUNK_SIZE = 5; // Number of characters to reveal at once
const POLLING_INTERVAL = 20; // milliseconds to check for updates
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
  
  // Track the last content update time for potential timeout detection
  const lastContentUpdateRef = useRef(Date.now());
  
  // Counters for debugging
  const statsRef = useRef({
    chunkCount: 0,
    totalBytes: 0,
    updateCount: 0,
    lastLogTime: Date.now(),
    processingTime: 0,
    processingCount: 0,
    batchSizes: [] as number[]
  });
  
  // Timer IDs
  const timersRef = useRef<{
    contentUpdateTimer: ReturnType<typeof setInterval> | null,
    debugTimer: ReturnType<typeof setInterval> | null
  }>({
    contentUpdateTimer: null,
    debugTimer: null
  });
  
  // Queue pending content updates
  const pendingUpdatesRef = useRef<{ timestamp: number, content: string }[]>([]);
  
  // Start streaming with reset state
  const startStreaming = useCallback(() => {
    console.log(`[StreamingContent] Starting streaming with new buffer`);
    
    // Clear existing content and reset refs
    contentBuffer.current = '';
    displayPositionRef.current = 0;
    setContent('');
    pendingUpdatesRef.current = [];
    
    // Reset stats
    statsRef.current = {
      chunkCount: 0,
      totalBytes: 0,
      updateCount: 0,
      lastLogTime: Date.now(),
      processingTime: 0,
      processingCount: 0,
      batchSizes: []
    };
    
    // Stop any existing timers
    if (timersRef.current.contentUpdateTimer) {
      clearInterval(timersRef.current.contentUpdateTimer);
      timersRef.current.contentUpdateTimer = null;
    }
    
    if (timersRef.current.debugTimer) {
      clearInterval(timersRef.current.debugTimer);
      timersRef.current.debugTimer = null;
    }
    
    // Start streaming
    isStreamingRef.current = true;
    setIsStreaming(true);
    lastContentUpdateRef.current = Date.now();
    
    // Start content update timer - checks for updates to display every POLLING_INTERVAL ms
    timersRef.current.contentUpdateTimer = setInterval(() => {
      // Skip if there's no new content to display
      if (displayPositionRef.current >= contentBuffer.current.length) return;
      
      const startTime = performance.now();
      
      // Calculate how much content to show
      const nextPosition = Math.min(
        displayPositionRef.current + CHUNK_SIZE,
        contentBuffer.current.length
      );
      
      if (nextPosition > displayPositionRef.current) {
        // Update display position
        displayPositionRef.current = nextPosition;
        
        // Update visible content
        const newContent = contentBuffer.current.substring(0, nextPosition);
        setContent(newContent);
        
        // Update stats
        statsRef.current.updateCount++;
        
        // Log every 10 updates
        if (statsRef.current.updateCount % 10 === 0) {
          console.log(`[StreamingContent] Update #${statsRef.current.updateCount}: Position ${nextPosition}/${contentBuffer.current.length}`);
        }
      }
      
      const endTime = performance.now();
      statsRef.current.processingTime += (endTime - startTime);
      statsRef.current.processingCount++;
      
    }, POLLING_INTERVAL);
    
    // Start debug timer - prints debug info every DEBUG_INTERVAL ms
    timersRef.current.debugTimer = setInterval(() => {
      const now = Date.now();
      const runTime = now - statsRef.current.lastLogTime;
      
      // Only log if we're still streaming and something has happened
      if (isStreamingRef.current && statsRef.current.updateCount > 0) {
        // Calculate average processing time
        const avgProcessingTime = statsRef.current.processingCount > 0 ? 
          statsRef.current.processingTime / statsRef.current.processingCount : 0;
        
        // Calculate average batch size
        const avgBatchSize = statsRef.current.batchSizes.length > 0 ?
          statsRef.current.batchSizes.reduce((a, b) => a + b, 0) / statsRef.current.batchSizes.length : 0;
        
        console.log(`[StreamingContent] STATS: 
          Runtime: ${(runTime/1000).toFixed(1)}s
          Buffer: ${contentBuffer.current.length} chars
          Display: ${displayPositionRef.current} chars
          Updates: ${statsRef.current.updateCount}
          Chunks: ${statsRef.current.chunkCount}
          Avg processing: ${avgProcessingTime.toFixed(2)}ms
          Avg batch: ${avgBatchSize.toFixed(1)} chars
          Pending updates: ${pendingUpdatesRef.current.length}
        `);
        
        // Reset some stats for the next interval
        statsRef.current.lastLogTime = now;
        statsRef.current.processingTime = 0;
        statsRef.current.processingCount = 0;
        statsRef.current.batchSizes = [];
      }
    }, DEBUG_INTERVAL);
    
  }, []);
  
  // Process pending content updates in batches
  const processPendingUpdates = useCallback(() => {
    // Skip if there are no pending updates
    if (pendingUpdatesRef.current.length === 0) return;
    
    // Take all pending updates
    const updates = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];
    
    // Calculate total characters to be added
    let totalChars = 0;
    updates.forEach(update => {
      totalChars += update.content.length;
    });
    
    // Add everything to the buffer
    for (const update of updates) {
      contentBuffer.current += update.content;
    }
    
    // Track batch size for stats
    statsRef.current.batchSizes.push(totalChars);
    
    // Log the batch processing
    console.log(`[StreamingContent] Processed batch of ${updates.length} updates (${totalChars} chars)`);
    
    // Update last content update time
    lastContentUpdateRef.current = Date.now();
  }, []);
  
  // Set up a regular interval to process pending updates
  useEffect(() => {
    if (!isStreaming) return;
    
    const processTimer = setInterval(processPendingUpdates, 50);
    
    return () => {
      clearInterval(processTimer);
    };
  }, [isStreaming, processPendingUpdates]);
  
  // Add a chunk to the streaming content
  const addChunk = useCallback((chunk: string) => {
    if (!isStreamingRef.current) {
      console.log(`[StreamingContent] Not streaming, ignoring chunk: "${chunk.substring(0, 20)}..."`);
      return;
    }
    
    // Queue the chunk for processing
    pendingUpdatesRef.current.push({
      timestamp: Date.now(),
      content: chunk
    });
    
    // Update stats
    statsRef.current.chunkCount++;
    statsRef.current.totalBytes += chunk.length;
    
    // For logging - only log every 5th chunk or large chunks
    if (statsRef.current.chunkCount % 5 === 0 || chunk.length > 100) {
      console.log(`[StreamingContent] Added chunk #${statsRef.current.chunkCount} (${chunk.length} chars). Buffer: ${contentBuffer.current.length}, pending: ${pendingUpdatesRef.current.length}`);
    }
    
    // Update last content update time
    lastContentUpdateRef.current = Date.now();
  }, []);
  
  // Stop streaming and ensure full content is displayed
  const stopStreaming = useCallback(() => {
    console.log(`[StreamingContent] Stopping streaming... Final buffer length: ${contentBuffer.current.length}`);
    
    // Process any pending updates first
    processPendingUpdates();
    
    // Update streaming state
    isStreamingRef.current = false;
    setIsStreaming(false);
    
    // Clear timers
    if (timersRef.current.contentUpdateTimer) {
      clearInterval(timersRef.current.contentUpdateTimer);
      timersRef.current.contentUpdateTimer = null;
    }
    
    if (timersRef.current.debugTimer) {
      clearInterval(timersRef.current.debugTimer);
      timersRef.current.debugTimer = null;
    }
    
    // Force display of all content
    setContent(contentBuffer.current);
    displayPositionRef.current = contentBuffer.current.length;
    
    // Log stats
    console.log(`[StreamingContent] Final stats: ${statsRef.current.chunkCount} chunks received, ${contentBuffer.current.length} chars in buffer, ${statsRef.current.updateCount} updates performed`);
  }, [processPendingUpdates]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timersRef.current.contentUpdateTimer) {
        clearInterval(timersRef.current.contentUpdateTimer);
      }
      if (timersRef.current.debugTimer) {
        clearInterval(timersRef.current.debugTimer);
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
