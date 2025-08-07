import { useLayoutEffect, useEffect, useState, useRef, useCallback } from "react"
import { Markdown } from '@/components/ui/markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
}

export function AnalysisDisplay({ 
  content, 
  isStreaming = false, 
  maxHeight = "200px" 
}: AnalysisDisplayProps) {
  // Container refs for different scroll strategies
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const endMarkerRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  
  // Scroll control states
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  
  // Extensive logging refs
  const renderCount = useRef(0)
  const scrollPositionLog = useRef<Array<{time: number, scrollTop: number, scrollHeight: number, clientHeight: number, isStreaming: boolean}>>([])
  const contentUpdateLog = useRef<Array<{time: number, length: number, delta: number, isStreaming: boolean, action: string}>>([])
  const scrollAttemptLog = useRef<Array<{time: number, method: string, success: boolean, details: string}>>([])
  
  // Performance metrics
  const renderTimes = useRef<Array<{start: number, end: number}>>([])
  const markdownRenderTime = useRef<{start: number, end: number}>({start: 0, end: 0})
  
  // Track scroll methods tried and their effectiveness
  const scrollMethodsAttempted = useRef<Record<string, {attempted: number, succeeded: number}>>({
    'scrollIntoView': {attempted: 0, succeeded: 0},
    'scrollTo': {attempted: 0, succeeded: 0},
    'scrollTop': {attempted: 0, succeeded: 0},
    'RAF': {attempted: 0, succeeded: 0}
  })

  // Log the render start
  useEffect(() => {
    const now = performance.now()
    renderCount.current += 1
    renderTimes.current.push({ start: now, end: 0 })
    
    // console.log(`🔄 [RENDER #${renderCount.current}] AnalysisDisplay - content: ${content?.length}chars, streaming: ${isStreaming}, shouldScroll: ${shouldAutoScroll}`);
    
    // Log DOM metrics if ref is available
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      // const scrollPercentage = Math.round((scrollTop / (scrollHeight - clientHeight || 1)) * 100)
      // console.log(`📏 [RENDER #${renderCount.current}] Container Metrics: scrollTop=${scrollTop}, scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, percentage=${scrollPercentage}%, diff=${scrollHeight - clientHeight}`);
      
      scrollPositionLog.current.push({
        time: Date.now(),
        scrollTop,
        scrollHeight,
        clientHeight,
        isStreaming
      })
      
      // Keep log size reasonable
      if (scrollPositionLog.current.length > 50) {
        scrollPositionLog.current.shift()
      }
    }
    
    return () => {
      // const duration = performance.now() - now
      renderTimes.current[renderTimes.current.length - 1].end = performance.now()
      // console.log(`🧹 [RENDER #${renderCount.current}] AnalysisDisplay cleanup - render took ${duration.toFixed(2)}ms`);
    }
  });

  // Content change detection
  useEffect(() => {
    const currentLength = content?.length || 0
    const delta = currentLength - prevContentLength.current
    prevContentLength.current = currentLength
    
    // console.log(`📄 [Content] Update - current=${currentLength}, prev=${prevContentLength.current}, delta=${delta}, streaming=${isStreaming}`);
    
    contentUpdateLog.current.push({
      time: Date.now(),
      length: currentLength,
      delta,
      isStreaming,
      action: 'content-change'
    })
    
    if (contentUpdateLog.current.length > 50) {
      contentUpdateLog.current.shift()
    }
  }, [content, isStreaming])
  
  // Debug content format - Removed
  // useEffect(() => {
  //   if (content && content !== "") {
  //     // console.log(`📝 [Content] First 100 chars: "${content.substring(0, 100)}..."`);
  //     // console.log(`📝 [Content] Last 100 chars: "...${content.substring(content.length - 100)}"`);
      
  //     if (content.includes('```')) {
  //       // console.log(`⚠️ [Content] Contains code blocks which might affect rendering height`);
  //     }
  //   }
  // }, [content]);
  
  // STRATEGY 1: scrollIntoView with smooth behavior - Kept for potential future use, logs commented
  const scrollToBottomWithIntoView = useCallback(() => {
    if (!endMarkerRef.current || !shouldAutoScroll) {
      // console.log(`🛑 [Scroll-IntoView] Skipped - ref exists: ${!!endMarkerRef.current}, shouldScroll: ${shouldAutoScroll}`);
      return false;
    }
    
    try {
      const beforeScrollTop = scrollContainerRef.current?.scrollTop || 0;
      
      // Try using scrollIntoView with smooth behavior
      scrollMethodsAttempted.current.scrollIntoView.attempted++;
      endMarkerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      
      const afterScrollTop = scrollContainerRef.current?.scrollTop || 0;
      const success = afterScrollTop > beforeScrollTop;
      
      // console.log(`📜 [Scroll-IntoView] Attempt result: before=${beforeScrollTop}, after=${afterScrollTop}, success=${success}`);
      
      scrollAttemptLog.current.push({
        time: Date.now(),
        method: 'scrollIntoView',
        success,
        details: `delta=${afterScrollTop - beforeScrollTop}`
      });
      
      if (success) {
        scrollMethodsAttempted.current.scrollIntoView.succeeded++;
      }
      
      return success;
    } catch (error) {
      console.error(`🚨 [Scroll-IntoView] Error:`, error);
      return false;
    }
  }, [shouldAutoScroll]);
  
  // STRATEGY 2: Direct scrollTo with options - Kept for potential future use, logs commented
  const scrollToBottomWithScrollTo = useCallback(() => {
    if (!scrollContainerRef.current || !shouldAutoScroll) {
      // console.log(`🛑 [Scroll-To] Skipped - ref exists: ${!!scrollContainerRef.current}, shouldScroll: ${shouldAutoScroll}`);
      return false;
    }
    
    try {
      const container = scrollContainerRef.current;
      const beforeScrollTop = container.scrollTop;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      
      scrollMethodsAttempted.current.scrollTo.attempted++;
      container.scrollTo({ 
        top: maxScrollTop,
        behavior: 'smooth'
      });
      
      // Need to check after a small delay since smooth scroll is async
      setTimeout(() => {
        const afterScrollTop = container.scrollTop;
        const success = Math.abs(afterScrollTop - maxScrollTop) < 5;
        
        // console.log(`📜 [Scroll-To] Attempt result: before=${beforeScrollTop}, after=${afterScrollTop}, target=${maxScrollTop}, success=${success}`);
        
        scrollAttemptLog.current.push({
          time: Date.now(),
          method: 'scrollTo',
          success,
          details: `delta=${afterScrollTop - beforeScrollTop}, target=${maxScrollTop}`
        });
        
        if (success) {
          scrollMethodsAttempted.current.scrollTo.succeeded++;
        }
      }, 50);
      
      return true; // Optimistic return
    } catch (error) {
      console.error(`🚨 [Scroll-To] Error:`, error);
      return false;
    }
  }, [shouldAutoScroll]);
  
  // STRATEGY 3: Direct scrollTop setting - Kept for potential future use, logs commented
  const scrollToBottomDirect = useCallback(() => {
    if (!scrollContainerRef.current || !shouldAutoScroll) {
      // console.log(`🛑 [Scroll-Direct] Skipped - ref exists: ${!!scrollContainerRef.current}, shouldScroll: ${shouldAutoScroll}`);
      return false;
    }
    
    try {
      const container = scrollContainerRef.current;
      const beforeScrollTop = container.scrollTop;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      
      scrollMethodsAttempted.current.scrollTop.attempted++;
      
      // Direct manipulation
      container.scrollTop = maxScrollTop;
      
      const afterScrollTop = container.scrollTop;
      const success = Math.abs(afterScrollTop - maxScrollTop) < 5;
      
      // console.log(`📜 [Scroll-Direct] Attempt result: before=${beforeScrollTop}, after=${afterScrollTop}, target=${maxScrollTop}, success=${success}, diff=${maxScrollTop - afterScrollTop}`);
      
      scrollAttemptLog.current.push({
        time: Date.now(),
        method: 'scrollTop',
        success,
        details: `delta=${afterScrollTop - beforeScrollTop}, target=${maxScrollTop}`
      });
      
      if (success) {
        scrollMethodsAttempted.current.scrollTop.succeeded++;
      }
      
      return success;
    } catch (error) {
      console.error(`🚨 [Scroll-Direct] Error:`, error);
      return false;
    }
  }, [shouldAutoScroll]);
  
  // STRATEGY 4: RequestAnimationFrame for smoother scrolling - Kept for potential future use, logs commented
  const scrollToBottomWithRAF = useCallback(() => {
    if (!scrollContainerRef.current || !shouldAutoScroll) {
      // console.log(`🛑 [Scroll-RAF] Skipped - ref exists: ${!!scrollContainerRef.current}, shouldScroll: ${shouldAutoScroll}`);
      return false;
    }
    
    try {
      const container = scrollContainerRef.current;
      const beforeScrollTop = container.scrollTop;
      const currentContentLength = content?.length || 0;
      
      scrollMethodsAttempted.current.RAF.attempted++;
      
      requestAnimationFrame(() => {
        if (!container) return;
        
        const maxScrollTop = container.scrollHeight - container.clientHeight;
        container.scrollTop = maxScrollTop;
        
        const afterScrollTop = container.scrollTop;
        const success = Math.abs(afterScrollTop - maxScrollTop) < 5;
        
        // console.log(`📜 [Scroll-RAF] Attempt result: before=${beforeScrollTop}, after=${afterScrollTop}, target=${maxScrollTop}, success=${success}, contentLength=${currentContentLength}`);
        
        scrollAttemptLog.current.push({
          time: Date.now(),
          method: 'RAF',
          success,
          details: `delta=${afterScrollTop - beforeScrollTop}, target=${maxScrollTop}`
        });
        
        if (success) {
          scrollMethodsAttempted.current.RAF.succeeded++;
        }
        
        setLastUpdateTime(Date.now());
      });
      
      return true; // Optimistic return
    } catch (error) {
      console.error(`🚨 [Scroll-RAF] Error:`, error);
      return false;
    }
  }, [shouldAutoScroll, content]); // Keep RAF definition

  // Simplified scroll function (direct method only for now) - Logs commented
  const scrollToBottom = useCallback(() => {
    if (!scrollContainerRef.current || !shouldAutoScroll) {
      // console.log(`🛑 [Scroll-Direct] Skipped - ref exists: ${!!scrollContainerRef.current}, shouldScroll: ${shouldAutoScroll}`);
      return false;
    }
    
    try {
      const container = scrollContainerRef.current;
      const beforeScrollTop = container.scrollTop;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      
      // Direct manipulation
      container.scrollTop = maxScrollTop;
      
      const afterScrollTop = container.scrollTop;
      // Check if scroll position is close to the bottom
      const success = Math.abs(afterScrollTop - maxScrollTop) < 5;
      
      // console.log(`📜 [Scroll-Direct] Attempt result: before=${beforeScrollTop}, after=${afterScrollTop}, target=${maxScrollTop}, success=${success}, diff=${maxScrollTop - afterScrollTop}`);
      
      scrollAttemptLog.current.push({
        time: Date.now(),
        method: 'scrollTop-direct', // Renamed for clarity
        success,
        details: `delta=${afterScrollTop - beforeScrollTop}, target=${maxScrollTop}`
      });
      
      return success;
    } catch (error) {
      console.error(`🚨 [Scroll-Direct] Error:`, error);
      return false;
    }
  }, [shouldAutoScroll]);

  // Main scroll effect using useLayoutEffect for better timing
  useLayoutEffect(() => {
    if (!scrollContainerRef.current) return;

    const currentContentLength = content?.length || 0;
    const delta = currentContentLength - prevContentLength.current; // prevContentLength updated in separate useEffect

    // console.log(`🔄 [LayoutScroll-Check] delta: ${delta}, shouldScroll: ${shouldAutoScroll}, isStreaming: ${isStreaming}`);

    // Trigger scroll if content changed OR if streaming is active (covers initial load during stream)
    // and auto-scroll is enabled.
    if ((delta > 0 || isStreaming) && shouldAutoScroll) {
      // console.log(`📜 [LayoutScroll-Attempt] Triggering direct scroll.`);
      scrollToBottom(); // Call the simplified direct scroll function
    }
    // No timeout needed here as useLayoutEffect runs after DOM mutations
  }, [content, isStreaming, shouldAutoScroll, scrollToBottom]); // Dependency on content ensures it runs after updates

  // Monitor user scroll to toggle auto-scroll behavior
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    
    const scrollContainer = scrollContainerRef.current;
    const handleScroll = () => {
      if (!scrollContainer) return;
      
      const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const currentScrollTop = scrollContainer.scrollTop;
      const isAtBottom = Math.abs(maxScrollTop - currentScrollTop) < 50;
      
      // console.log(`📜 [User-Scroll] position: ${currentScrollTop}/${maxScrollTop} (${Math.round((currentScrollTop/Math.max(maxScrollTop, 1))*100)}%), isAtBottom: ${isAtBottom}, shouldAutoScroll: ${shouldAutoScroll}`);
      
      if (shouldAutoScroll !== isAtBottom) {
        // console.log(`🔄 [User-Scroll] Auto-scroll changed to ${isAtBottom} from user scroll`);
        setShouldAutoScroll(isAtBottom);
      }
    };
    
    // console.log(`👂 [Event] Adding scroll event listener`);
    scrollContainer.addEventListener('scroll', handleScroll);
    
    return () => {
      // console.log(`🧹 [Event] Removing scroll event listener`);
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [shouldAutoScroll]);
  
  // Interval for continuous scroll attempts during streaming - Logs commented
  useEffect(() => {
    if (!isStreaming || !scrollContainerRef.current || !shouldAutoScroll) {
      // console.log(`🛑 [Interval] Skip continuous scroll - streaming: ${isStreaming}, ref: ${!!scrollContainerRef.current}, autoScroll: ${shouldAutoScroll}`);
      return;
    }
    
    // console.log(`🔄 [Interval] Setting up continuous scroll interval for streaming`);
    
    const intervalId = setInterval(() => {
      if (scrollContainerRef.current && shouldAutoScroll) {
        // console.log(`🔄 [Interval] Continuous scroll check`);
        scrollToBottom();
      }
    }, 500);
    
    return () => {
      // console.log(`🧹 [Interval] Clearing continuous scroll interval`);
      clearInterval(intervalId);
    };
  }, [isStreaming, shouldAutoScroll, scrollToBottom]);
  
  // Stream status monitoring - Logs commented
  useEffect(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        // console.log(`🔄 Stream status changed to idle from ${streamStatus}`);
        setStreamStatus('idle');
      }
      return;
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime;
      const newStatus = timeSinceUpdate > 1500 ? 'waiting' : 'streaming';
      
      if (streamStatus !== newStatus) {
        // console.log(`🔄 Stream status changed to ${newStatus} from ${streamStatus}, time since update: ${timeSinceUpdate}ms`);
        setStreamStatus(newStatus);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isStreaming, lastUpdateTime, streamStatus]);

  // Log statistics on unmount - Removed
  // useEffect(() => {
  //   return () => {
  //     // console.log(`📊 ANALYSIS DISPLAY LOG DUMP ON UNMOUNT`);
  //     // console.log(`📊 Scroll positions (${scrollPositionLog.current.length})`, scrollPositionLog.current);
  //     // console.log(`📊 Content updates (${contentUpdateLog.current.length})`, contentUpdateLog.current);
  //     // console.log(`📊 Scroll attempts (${scrollAttemptLog.current.length})`, scrollAttemptLog.current);
  //     // console.log(`📊 Scroll methods effectiveness:`, scrollMethodsAttempted.current);
      
  //     // const totalRenderTime = renderTimes.current.reduce((acc, time) => acc + (time.end - time.start), 0);
  //     // console.log(`📊 Rendering statistics:
  //     //   Total renders: ${renderCount.current}
  //     //   Average render time: ${(totalRenderTime / Math.max(1, renderTimes.current.length)).toFixed(2)}ms
  //     //   Total render time: ${totalRenderTime.toFixed(2)}ms
  //     // `);
  //   };
  // }, []);

  // For markdown rendering performance tracking - Logs commented
  const beforeMarkdownRender = () => {
    markdownRenderTime.current.start = performance.now();
    // console.log(`⏱️ [Markdown] Starting rendering - content length: ${content?.length || 0}`);
  };
  
  const afterMarkdownRender = useCallback(() => {
    if (markdownRenderTime.current.start > 0) {
      markdownRenderTime.current.end = performance.now();
      // const duration = markdownRenderTime.current.end - markdownRenderTime.current.start;
      // console.log(`⏱️ [Markdown] Rendering completed in ${duration.toFixed(2)}ms`);
    }
  }, []);

  // Trigger scroll to bottom programmatically - Logs commented
  const forceScrollToBottom = useCallback(() => {
    // console.log(`🆘 [Manual] Emergency scroll to bottom triggered by user`);
    setShouldAutoScroll(true);
    scrollToBottom();
  }, [scrollToBottom]);
  
  // Add effect to run afterMarkdownRender after content updates
  useEffect(() => {
    if (content) {
      afterMarkdownRender();
    }
  }, [content, afterMarkdownRender]);

  if (!content) {
    // console.log(`⚠️ [Render] No content provided, rendering null`);
    return null;
  }

  // console.log(`🏗️ [Render] AnalysisDisplay - maxHeight: ${maxHeight}, isStreaming: ${isStreaming}, streamStatus: ${streamStatus}`);
  
  beforeMarkdownRender();

  return (
    <div className="relative">
      {/* Using a native div with overflow instead of ScrollArea component */}
      <div 
        ref={scrollContainerRef}
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full overflow-y-auto analysis-scroll-container"
        style={{ height: maxHeight, maxHeight }}
        data-streaming={isStreaming ? "true" : "false"}
        data-should-scroll={shouldAutoScroll ? "true" : "false"}
      >
        <div className="overflow-x-hidden w-full max-w-full analysis-content" data-testid="analysis-content">
          <Markdown
            className="text-sm prose-invert break-words prose-p:my-1 prose-headings:my-2 max-w-full"
          >
            {content}
          </Markdown>
          {/* This is the element we'll scroll into view */}
          <div id="content-end-marker" ref={endMarkerRef} style={{ height: '2px' }} />
        </div>
      </div>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {streamStatus === 'waiting' ? "Waiting for data..." : "Streaming..."}
            </span>
            <div className="flex space-x-1">
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-75' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-150' : 'bg-muted-foreground'}`} />
            </div>
          </div>
        </div>
      )}
      
      {!shouldAutoScroll && isStreaming && (
        <button 
          onClick={forceScrollToBottom}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
      
      {/* Debug overlay removed */}
      {/* <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-black/50 px-1 py-0.5 rounded opacity-50 hover:opacity-100">
        {content?.length || 0} chars | {isStreaming ? 'streaming' : 'static'} | {shouldAutoScroll ? 'auto' : 'manual'}
      </div> */}
    </div>
  );
}
