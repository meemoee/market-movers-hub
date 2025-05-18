
import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface StreamingContentDisplayProps {
  content: string;
  isStreaming: boolean;
  maxHeight?: string | number;
  rawBuffer?: string;  // Access to raw buffer for debugging
  displayPosition?: number; // Access to display position for debugging
}

export function StreamingContentDisplay({ 
  content, 
  isStreaming, 
  maxHeight = "200px",
  rawBuffer,
  displayPosition
}: StreamingContentDisplayProps) {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const plainTextRef = useRef<HTMLPreElement>(null);
  const shouldScrollRef = useRef<boolean>(true);
  
  // Stable ref that won't be reset by React re-renders
  const stableStateRef = useRef<{
    visibleContent: string;
    lastUpdateTime: number;
    renderCount: number;
    lastContent: string;
    typewriterActive: boolean;
    currentPosition: number;
    typewriterTimerId: number | null;
    isFirstRender: boolean;
  }>({
    visibleContent: '',
    lastUpdateTime: Date.now(),
    renderCount: 0,
    lastContent: "",
    typewriterActive: false,
    currentPosition: 0,
    typewriterTimerId: null,
    isFirstRender: true
  });
  
  // State for health check
  const [streamHealth, setStreamHealth] = useState<'healthy' | 'stalled' | 'error'>('healthy');
  
  // CRITICAL: Initialize plainTextRef content on first render to prevent React from clearing it
  useLayoutEffect(() => {
    if (plainTextRef.current && stableStateRef.current.isFirstRender) {
      if (plainTextRef.current.textContent === null || plainTextRef.current.textContent === '') {
        plainTextRef.current.textContent = ''; // Ensure it's initialized
      }
      stableStateRef.current.isFirstRender = false;
    }
  }, []);
  
  // Function to check stream health
  const checkStreamHealth = () => {
    if (!isStreaming) return;
    
    const now = Date.now();
    const timeSinceUpdate = now - stableStateRef.current.lastUpdateTime;
    
    if (timeSinceUpdate > 5000 && stableStateRef.current.visibleContent.length === 0) {
      console.log(`STREAM_HEALTH: No content received after ${timeSinceUpdate}ms`);
      setStreamHealth('stalled');
    }
  };
  
  // Health check timer
  useEffect(() => {
    if (isStreaming) {
      const timer = setInterval(checkStreamHealth, 2000);
      return () => clearInterval(timer);
    }
  }, [isStreaming]);
  
  // CRITICAL: Use useLayoutEffect for DOM manipulation to ensure it happens before browser paint
  useLayoutEffect(() => {
    if (!isStreaming || !content || !plainTextRef.current) return;
    
    // Store the full content for reference
    const fullContent = content;
    
    // Don't re-render if we're already showing all content
    if (stableStateRef.current.visibleContent === fullContent) {
      return;
    }
    
    // If we already have a typewriter running, don't start a new one
    if (stableStateRef.current.typewriterActive) {
      console.log(`TYPEWRITER: Already active, updating target content to length ${fullContent.length}`);
      return;
    }
    
    console.log(`TYPEWRITER: Starting new typewriter effect from position ${stableStateRef.current.currentPosition}/${fullContent.length}`);
    
    // Mark typewriter as active
    stableStateRef.current.typewriterActive = true;
    
    // Function to add characters with small delay
    const addCharacters = () => {
      // Don't continue if component unmounted or streaming stopped
      if (!plainTextRef.current || !isStreaming) {
        stableStateRef.current.typewriterActive = false;
        return;
      }
      
      // Calculate how many characters to show next (5 characters at a time)
      const charsToAdd = 5;
      const nextPosition = Math.min(stableStateRef.current.currentPosition + charsToAdd, fullContent.length);
      
      // Update the visible content in our stable ref
      stableStateRef.current.visibleContent = fullContent.substring(0, nextPosition);
      
      // Update DOM directly - CRITICAL PART
      if (plainTextRef.current) {
        plainTextRef.current.textContent = stableStateRef.current.visibleContent;
        // Update health check timestamp
        stableStateRef.current.lastUpdateTime = Date.now();
        
        // Reset health to healthy when we receive content
        if (streamHealth !== 'healthy' && stableStateRef.current.visibleContent.length > 0) {
          setStreamHealth('healthy');
        }
      }
      
      // Log progress occasionally
      if (nextPosition % 20 === 0 || nextPosition === fullContent.length) {
        console.log(`TYPEWRITER: Updated to position ${nextPosition}/${fullContent.length}`);
      }
      
      // Scroll if needed
      if (containerRef.current && shouldScrollRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      
      // Continue if we haven't reached the end
      stableStateRef.current.currentPosition = nextPosition;
      if (nextPosition < fullContent.length && isStreaming) {
        stableStateRef.current.typewriterTimerId = window.setTimeout(addCharacters, 10); // 10ms delay between updates
      } else {
        console.log(`TYPEWRITER: Finished typewriter at position ${nextPosition}`);
        stableStateRef.current.typewriterActive = false;
      }
    };
    
    // Start adding characters
    addCharacters();
    
    // Cleanup function to stop typewriter when component unmounts or effect re-runs
    return () => {
      if (stableStateRef.current.typewriterTimerId !== null) {
        clearTimeout(stableStateRef.current.typewriterTimerId);
        stableStateRef.current.typewriterTimerId = null;
      }
      stableStateRef.current.typewriterActive = false;
    };
  }, [content, isStreaming, streamHealth]);
  
  // Track content updates for debugging
  useEffect(() => {
    if (content !== stableStateRef.current.lastContent) {
      stableStateRef.current.renderCount += 1;
      console.log(`STREAM_DISPLAY: New content update #${stableStateRef.current.renderCount}, length: ${content.length}`);
      
      // Check if content was significantly increased
      if (content.length > stableStateRef.current.lastContent.length + 50) {
        console.log(`STREAM_DISPLAY: Large content increase: +${content.length - stableStateRef.current.lastContent.length} chars`);
      }
      
      stableStateRef.current.lastContent = content;
      // Update health check timestamp whenever we get new content
      stableStateRef.current.lastUpdateTime = Date.now();
    }
  }, [content]);

  // Handle scroll events to detect if user has scrolled up
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
      shouldScrollRef.current = isAtBottom;
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Force scroll to bottom
  const scrollToBottom = () => {
    if (containerRef.current) {
      shouldScrollRef.current = true;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  };
  
  // Force content display in case of stalled stream
  const forceDisplayFullContent = () => {
    if (plainTextRef.current && rawBuffer) {
      plainTextRef.current.textContent = rawBuffer;
      stableStateRef.current.visibleContent = rawBuffer;
      stableStateRef.current.currentPosition = rawBuffer.length;
      setStreamHealth('healthy');
      console.log(`STREAM_DISPLAY: Forced display of full content (${rawBuffer.length} chars)`);
    }
  };
  
  // Debug info
  const debugInfo = {
    contentLength: content.length,
    bufferLength: rawBuffer?.length || 0,
    displayPosition: displayPosition || 0,
    renderCount: stableStateRef.current.renderCount,
    isStreaming,
    visibleLength: stableStateRef.current.visibleContent.length,
    health: streamHealth,
    typewriterActive: stableStateRef.current.typewriterActive
  };

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className="rounded-md border p-4 bg-gray-900 w-full max-w-full overflow-y-auto"
        style={{ height: maxHeight, maxHeight }}
      >
        {/* Debug bar at the top */}
        <div className="mb-4 p-2 bg-gray-800 dark:bg-gray-800 rounded text-xs font-mono text-gray-300">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div>Content: {debugInfo.contentLength} chars</div>
            <div>Buffer: {debugInfo.bufferLength} chars</div>
            <div>Position: {stableStateRef.current.currentPosition}/{debugInfo.bufferLength}</div>
            <div>Visible: {stableStateRef.current.visibleContent.length} chars</div>
            <div>Renders: {debugInfo.renderCount}</div>
            <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
            <div>Health: {debugInfo.health}</div>
            <div>Typewriter: {debugInfo.typewriterActive ? 'Active' : 'Idle'}</div>
          </div>
        </div>
        
        {/* Direct text display (manipulated by DOM) */}
        <div className="mb-4 p-2 bg-gray-800 dark:bg-gray-800 rounded text-xs overflow-auto max-h-32 text-gray-300">
          <pre 
            ref={plainTextRef} 
            className="whitespace-pre-wrap break-words"
          >
            {/* Content is managed directly via DOM manipulation */}
          </pre>
        </div>
        
        {/* Main content display with ReactMarkdown (only updated after streaming) */}
        <div 
          ref={contentRef}
          className="text-sm whitespace-pre-wrap break-words w-full max-w-full text-gray-300"
        >
          {!isStreaming && (
            <ReactMarkdown>
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
      
      {/* Streaming indicators with health status */}
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {streamHealth === 'healthy' ? 'Streaming...' : 
               streamHealth === 'stalled' ? 'Stream stalled...' : 
               'Error streaming'}
            </span>
            <div className="flex space-x-1">
              <div className={`w-2 h-2 rounded-full ${
                streamHealth === 'healthy' ? 'bg-primary animate-pulse' : 
                streamHealth === 'stalled' ? 'bg-yellow-500 animate-ping' :
                'bg-destructive'
              }`} />
              <div className={`w-2 h-2 rounded-full ${
                streamHealth === 'healthy' ? 'bg-primary animate-pulse delay-75' : 
                streamHealth === 'stalled' ? 'bg-yellow-500 animate-ping delay-75' :
                'bg-destructive delay-75'
              }`} />
              <div className={`w-2 h-2 rounded-full ${
                streamHealth === 'healthy' ? 'bg-primary animate-pulse delay-150' : 
                streamHealth === 'stalled' ? 'bg-yellow-500 animate-ping delay-150' :
                'bg-destructive delay-150'
              }`} />
            </div>
          </div>
        </div>
      )}
      
      {/* Recovery options for stalled streams */}
      {streamHealth === 'stalled' && isStreaming && (
        <div className="absolute bottom-2 left-2 flex gap-2">
          <Button 
            onClick={forceDisplayFullContent}
            size="sm"
            variant="destructive"
            className="text-xs py-1 px-2 h-auto"
          >
            Force Display
            <RefreshCw className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}
      
      {/* Auto-scroll button */}
      {!shouldScrollRef.current && isStreaming && streamHealth === 'healthy' && (
        <button 
          onClick={scrollToBottom}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
}
