
import { useEffect, useRef, useState, useCallback } from 'react';
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
  
  // State for visible content
  const [visibleContent, setVisibleContent] = useState<string>('');
  
  // Ref for content processing state that persists across renders
  const stateRef = useRef<{
    // Content state
    nextUpdatePosition: number;
    targetContent: string;
    lastUpdateTime: number;
    
    // Animation state
    isAnimating: boolean;
    animationFrameId: number | null;
    
    // Performance stats
    renderCount: number;
    updateCount: number;
    
    // Debug info
    processedChars: number;
    lastLogTime: number;
    
    // Error recovery
    failedUpdates: number;
  }>({
    nextUpdatePosition: 0,
    targetContent: '',
    lastUpdateTime: Date.now(),
    isAnimating: false,
    animationFrameId: null,
    renderCount: 0,
    updateCount: 0,
    processedChars: 0,
    lastLogTime: Date.now(),
    failedUpdates: 0
  });
  
  // Stream health monitoring state
  const [streamHealth, setStreamHealth] = useState<'healthy' | 'stalled' | 'error'>('healthy');
  
  // Performance stats
  const performanceRef = useRef<{
    startTime: number;
    frameCount: number;
    lastFrameTime: number;
    typewriterUpdates: number;
    processingDuration: number;
  }>({
    startTime: Date.now(),
    frameCount: 0,
    lastFrameTime: 0,
    typewriterUpdates: 0,
    processingDuration: 0
  });
  
  // Increment render counter
  useEffect(() => {
    stateRef.current.renderCount++;
    console.log(`[StreamingDisplay] Render #${stateRef.current.renderCount}, content length: ${content?.length || 0}`);
  });
  
  // Track content changes for debugging
  useEffect(() => {
    if (content !== stateRef.current.targetContent) {
      const now = Date.now();
      const prevLength = stateRef.current.targetContent.length;
      const newLength = content?.length || 0;
      const delta = newLength - prevLength;
      
      if (delta > 0) {
        console.log(
          `[StreamingDisplay] Content updated: +${delta} chars, ` +
          `total: ${newLength}, ` + 
          `time since last update: ${now - stateRef.current.lastUpdateTime}ms`
        );
        
        // Update our target content
        stateRef.current.targetContent = content;
        stateRef.current.lastUpdateTime = now;
        
        // Reset health check
        setStreamHealth('healthy');
      }
    }
  }, [content]);
  
  // ===========================================
  // IMPROVED TYPEWRITER IMPLEMENTATION
  // ===========================================
  // This uses requestAnimationFrame for smoother animation
  // and is designed to be resilient against React re-renders
  // ===========================================
  
  // Start the typewriter animation - uses requestAnimationFrame for smooth animation
  const startTypewriterAnimation = useCallback(() => {
    if (stateRef.current.isAnimating) return; // Don't start if already running
    
    console.log(`[StreamingDisplay] Starting typewriter animation`);
    stateRef.current.isAnimating = true;
    
    // Define the animation frame function
    const animate = () => {
      const now = Date.now();
      // Track frame rate
      performanceRef.current.frameCount++;
      if (now - performanceRef.current.lastFrameTime > 5000) {
        const fps = performanceRef.current.frameCount / ((now - performanceRef.current.lastFrameTime) / 1000);
        console.log(`[StreamingDisplay] Animation running at ${fps.toFixed(1)} FPS`);
        performanceRef.current.frameCount = 0;
        performanceRef.current.lastFrameTime = now;
      }
      
      // Process typewriter update
      const startProcess = performance.now();
      processTypewriterUpdate();
      const endProcess = performance.now();
      performanceRef.current.processingDuration += (endProcess - startProcess);
      
      // Continue animation if we have content to display and we're streaming
      if (
        stateRef.current.nextUpdatePosition < stateRef.current.targetContent.length &&
        isStreaming
      ) {
        stateRef.current.animationFrameId = requestAnimationFrame(animate);
      } else {
        console.log(`[StreamingDisplay] Stopping animation - position: ${stateRef.current.nextUpdatePosition}, target length: ${stateRef.current.targetContent.length}`);
        stateRef.current.isAnimating = false;
        stateRef.current.animationFrameId = null;
      }
    };
    
    // Start the animation
    performanceRef.current.lastFrameTime = Date.now();
    performanceRef.current.frameCount = 0;
    stateRef.current.animationFrameId = requestAnimationFrame(animate);
    
    return () => {
      // Cleanup function
      if (stateRef.current.animationFrameId !== null) {
        cancelAnimationFrame(stateRef.current.animationFrameId);
        stateRef.current.animationFrameId = null;
        stateRef.current.isAnimating = false;
      }
    };
  }, [isStreaming]);
  
  // Process a single typewriter update - controlled amount of characters
  const processTypewriterUpdate = useCallback(() => {
    // Get current state
    const { nextUpdatePosition, targetContent } = stateRef.current;
    
    // Don't update if we're already at the end
    if (nextUpdatePosition >= targetContent.length) return;
    
    // Calculate how much to show - 5 chars at a time
    const charsToAdd = 5;
    const newPosition = Math.min(nextUpdatePosition + charsToAdd, targetContent.length);
    
    // Update the visible content with the next chunk
    const newVisibleContent = targetContent.substring(0, newPosition);
    setVisibleContent(newVisibleContent);
    
    // Update state
    stateRef.current.nextUpdatePosition = newPosition;
    stateRef.current.updateCount++;
    
    // Track performance
    performanceRef.current.typewriterUpdates++;
    
    // Scroll if needed
    if (containerRef.current && shouldScrollRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    
    // Log progress periodically
    if (stateRef.current.updateCount % 10 === 0) {
      const progress = Math.round((newPosition / Math.max(targetContent.length, 1)) * 100);
      console.log(`[StreamingDisplay] Update #${stateRef.current.updateCount}: ${newPosition}/${targetContent.length} (${progress}%)`);
    }
  }, []);
  
  // ===========================================
  // EFFECT HOOKS FOR MONITORING AND CONTROL
  // ===========================================
  
  // Start/stop typewriter based on streaming state
  useEffect(() => {
    // Reset display and start fresh when streaming begins
    if (isStreaming) {
      console.log(`[StreamingDisplay] Streaming started, resetting display`);
      stateRef.current.nextUpdatePosition = 0;
      stateRef.current.targetContent = content || '';
      setVisibleContent('');
      performanceRef.current.startTime = Date.now();
      performanceRef.current.typewriterUpdates = 0;
      performanceRef.current.processingDuration = 0;
      
      return startTypewriterAnimation();
    } else if (!isStreaming && content) {
      // Show full content immediately when streaming ends
      console.log(`[StreamingDisplay] Streaming ended, showing full content`);
      setVisibleContent(content);
      stateRef.current.nextUpdatePosition = content.length;
      
      // Log performance stats
      const totalTime = Date.now() - performanceRef.current.startTime;
      const processingTime = performanceRef.current.processingDuration;
      console.log(`[StreamingDisplay] Performance: ${performanceRef.current.typewriterUpdates} updates in ${totalTime}ms, processing took ${processingTime.toFixed(2)}ms (${(processingTime/totalTime*100).toFixed(2)}%)`);
    }
  }, [isStreaming, content, startTypewriterAnimation]);
  
  // Monitor stream health
  useEffect(() => {
    if (!isStreaming) return;
    
    const healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceUpdate = now - stateRef.current.lastUpdateTime;
      
      if (timeSinceUpdate > 5000 && stateRef.current.targetContent.length === 0) {
        console.log(`[StreamingDisplay] Stream stalled: No content received after ${timeSinceUpdate}ms`);
        setStreamHealth('stalled');
      }
    }, 1000);
    
    return () => clearInterval(healthCheckInterval);
  }, [isStreaming]);
  
  // Handle scroll events to detect if user has scrolled
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
    if (rawBuffer) {
      console.log(`[StreamingDisplay] Forcing full content display (${rawBuffer.length} chars)`);
      setVisibleContent(rawBuffer);
      stateRef.current.nextUpdatePosition = rawBuffer.length;
      setStreamHealth('healthy');
    }
  };
  
  // Debug info
  const debugInfo = {
    contentLength: content?.length || 0,
    visibleLength: visibleContent.length,
    bufferLength: rawBuffer?.length || 0,
    nextPosition: stateRef.current.nextUpdatePosition,
    displayPosition: displayPosition || 0,
    renderCount: stateRef.current.renderCount,
    updateCount: stateRef.current.updateCount,
    isStreaming,
    health: streamHealth,
    isAnimating: stateRef.current.isAnimating
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
            <div>Position: {debugInfo.nextPosition}/{debugInfo.bufferLength}</div>
            <div>Visible: {debugInfo.visibleLength} chars</div>
            <div>Updates: {debugInfo.updateCount}</div>
            <div>Renders: {debugInfo.renderCount}</div>
            <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
            <div>Health: {debugInfo.health}</div>
            <div>Animating: {debugInfo.isAnimating ? 'Yes' : 'No'}</div>
          </div>
        </div>
        
        {/* Typewriter text display */}
        <div className="mb-4 p-2 bg-gray-800 dark:bg-gray-800 rounded text-xs overflow-auto max-h-32 text-gray-300">
          <pre className="whitespace-pre-wrap break-words">
            {visibleContent}
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
