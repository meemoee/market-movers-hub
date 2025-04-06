
import { useLayoutEffect, useEffect, useState, useRef, useCallback } from "react"
import ReactMarkdown from 'react-markdown'

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
  // Container refs 
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const endMarkerRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  
  // Scroll control states
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  
  // Debug state to expose current scroll metrics
  const [debugInfo, setDebugInfo] = useState<{
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    diff: number;
  }>({ scrollTop: 0, scrollHeight: 0, clientHeight: 0, diff: 0 })

  // Debug logging for component rendering
  useEffect(() => {
    console.log(`🔄 AnalysisDisplay RENDER: content length=${content?.length || 0}, isStreaming=${isStreaming}, maxHeight=${maxHeight}`);
    
    if (content) {
      console.log(`📝 Content preview: "${content.substring(0, 50)}..."`);
    }
  }, [content, isStreaming, maxHeight]);

  // Force height difference to enable scrolling
  useEffect(() => {
    if (scrollContainerRef.current) {
      const observer = new MutationObserver((mutations) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        
        const { scrollHeight, clientHeight } = container;
        const difference = scrollHeight - clientHeight;
        
        console.log(`🔬 [Observer] Content size changed - scrollHeight: ${scrollHeight}, clientHeight: ${clientHeight}, difference: ${difference}`);
        
        // If the container has no scroll area (difference <= 0), add a spacer
        if (difference <= 10 && container.scrollHeight > 50) {
          console.log(`🔧 [Observer] Adding extra space to force scrolling - current difference: ${difference}`);
          
          // Find or create spacer element
          let spacer = container.querySelector('.scroll-spacer');
          if (!spacer) {
            spacer = document.createElement('div');
            spacer.className = 'scroll-spacer';
            // Fix: Type assertions for HTMLElement
            (spacer as HTMLElement).style.height = '50px';
            (spacer as HTMLElement).style.width = '100%';
            container.appendChild(spacer);
            console.log(`🔧 [Observer] Created new spacer element`);
          } else {
            // Fix: Type assertions for HTMLElement
            const currentHeight = parseInt((spacer as HTMLElement).style.height, 10) || 50;
            (spacer as HTMLElement).style.height = `${currentHeight + 20}px`;
            console.log(`🔧 [Observer] Increased spacer height to ${(spacer as HTMLElement).style.height}`);
          }
        }
        
        // Update debug info
        setDebugInfo({
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          diff: container.scrollHeight - container.clientHeight
        });
        
        // Try to scroll to the bottom on mutation if auto-scroll is enabled
        if (shouldAutoScroll && endMarkerRef.current) {
          try {
            console.log(`📜 [Observer] Attempting to scroll to bottom after DOM mutation`);
            endMarkerRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          } catch (err) {
            console.error('Error scrolling on mutation:', err);
          }
        }
      });
      
      observer.observe(scrollContainerRef.current, { 
        attributes: true, 
        childList: true, 
        subtree: true, 
        characterData: true 
      });
      
      console.log(`🔬 [Observer] Set up mutation observer on scroll container`);
      
      return () => {
        console.log(`🔬 [Observer] Disconnecting mutation observer`);
        observer.disconnect();
      };
    }
  }, [shouldAutoScroll]);

  // Main auto-scroll effect - using combined strategy
  useEffect(() => {
    if (!content || !scrollContainerRef.current || !endMarkerRef.current || !shouldAutoScroll) return;
    
    const container = scrollContainerRef.current;
    const endMarker = endMarkerRef.current;
    const contentLength = content?.length || 0;
    const delta = contentLength - prevContentLength.current;
    prevContentLength.current = contentLength;
    
    console.log(`📜 [Scroll] Auto-scroll check - content delta: ${delta}, shouldScroll: ${shouldAutoScroll}, isStreaming: ${isStreaming}`);
    
    if (delta > 0 || isStreaming) {
      console.log(`📜 [Scroll] Attempting to scroll - delta: ${delta}, container height: ${container.clientHeight}, content height: ${container.scrollHeight}`);
      
      // Use immediate scrolling for reliability
      setTimeout(() => {
        try {
          if (!container || !endMarker) return;
          
          // First try scrollIntoView with auto for reliability
          console.log(`📜 [Scroll] Using scrollIntoView with 'auto'`);
          endMarker.scrollIntoView({ behavior: 'auto', block: 'end' });
          
          // Then ensure we're at the bottom with direct scrollTop
          setTimeout(() => {
            if (!container) return;
            const maxScroll = container.scrollHeight - container.clientHeight;
            
            if (maxScroll > 0) {
              console.log(`📜 [Scroll] Setting scrollTop to maximum: ${maxScroll}`);
              container.scrollTop = maxScroll;
            }
            
            // Log scroll position after attempt
            console.log(`📜 [Scroll] Final position: ${container.scrollTop}/${maxScroll}`);
            
            // Update debug info
            setDebugInfo({
              scrollTop: container.scrollTop,
              scrollHeight: container.scrollHeight,
              clientHeight: container.clientHeight,
              diff: container.scrollHeight - container.clientHeight
            });
          }, 10);
        } catch (err) {
          console.error(`🚨 [Scroll] Error during scroll attempt:`, err);
        }
      }, 10);
    }
  }, [content, shouldAutoScroll, isStreaming]);

  // Monitor scroll events to detect user scroll
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    
    const handleScroll = () => {
      if (!container) return;
      
      const { scrollTop, scrollHeight, clientHeight } = container;
      const maxScrollTop = scrollHeight - clientHeight;
      const isAtBottom = maxScrollTop <= 30 || Math.abs(maxScrollTop - scrollTop) < 30;
      
      console.log(`📜 [User-Scroll] Position: ${scrollTop}/${maxScrollTop} (${Math.round((scrollTop/Math.max(maxScrollTop, 1))*100)}%), isAtBottom: ${isAtBottom}`);
      
      if (shouldAutoScroll !== isAtBottom) {
        console.log(`🔄 [User-Scroll] Auto-scroll toggled to ${isAtBottom} (user initiated)`);
        setShouldAutoScroll(isAtBottom);
      }
      
      // Update debug info
      setDebugInfo({
        scrollTop,
        scrollHeight,
        clientHeight,
        diff: scrollHeight - clientHeight
      });
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [shouldAutoScroll]);

  // Stream status monitoring
  useEffect(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        console.log(`🔄 Stream status changed to idle from ${streamStatus}`);
        setStreamStatus('idle');
      }
      return;
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime;
      const newStatus = timeSinceUpdate > 1500 ? 'waiting' : 'streaming';
      
      if (streamStatus !== newStatus) {
        console.log(`🔄 Stream status changed to ${newStatus} from ${streamStatus}, time since update: ${timeSinceUpdate}ms`);
        setStreamStatus(newStatus);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isStreaming, lastUpdateTime, streamStatus]);

  // Content change detection
  useEffect(() => {
    const currentLength = content?.length || 0;
    const delta = currentLength - prevContentLength.current;
    
    if (delta !== 0) {
      console.log(`📄 [Content] Length changed: ${prevContentLength.current} -> ${currentLength} (delta: ${delta})`);
      prevContentLength.current = currentLength;
      setLastUpdateTime(Date.now());
    }
    
    if (content) {
      const previewLength = 50;
      console.log(`📝 [Content] Preview - start: "${content.substring(0, previewLength)}..."${content.length > previewLength*2 ? ` end: "...${content.substring(content.length - previewLength)}"` : ""}`);
    }
  }, [content]);

  // Interval for continuous attempts during streaming
  useEffect(() => {
    if (!isStreaming || !shouldAutoScroll || !scrollContainerRef.current) {
      return;
    }
    
    console.log(`🔁 [Interval] Setting up periodic scroll check for streaming content`);
    
    const interval = setInterval(() => {
      const container = scrollContainerRef.current;
      if (!container || !shouldAutoScroll) return;
      
      const maxScroll = container.scrollHeight - container.clientHeight;
      const currentScroll = container.scrollTop;
      const diff = maxScroll - currentScroll;
      
      if (diff > 10) {
        console.log(`🔁 [Interval] Gap detected (${diff}px), scrolling to bottom`);
        
        try {
          if (endMarkerRef.current) {
            endMarkerRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          } else {
            container.scrollTop = maxScroll;
          }
        } catch (err) {
          console.error(`🚨 [Interval] Scroll error:`, err);
        }
      }
      
      // Update debug info
      setDebugInfo({
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        diff: container.scrollHeight - container.clientHeight
      });
      
    }, 1000);
    
    return () => {
      console.log(`🧹 [Interval] Clearing periodic scroll check`);
      clearInterval(interval);
    };
  }, [isStreaming, shouldAutoScroll]);
  
  // Force scrollable behavior on mount and content update
  useLayoutEffect(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    
    // Force a minimum height to ensure scrollable content
    if (typeof maxHeight === 'string' && maxHeight.includes('%')) {
      container.style.minHeight = '200px';
      console.log(`🔧 [Layout] Setting minimum height: 200px for percentage maxHeight: ${maxHeight}`);
    }
    
    // Add bottom padding to ensure content doesn't exactly match container height
    container.style.paddingBottom = '40px';
    console.log(`🔧 [Layout] Adding bottom padding: 40px to container`);
    
    // Ensure scroll works on first render
    setTimeout(() => {
      if (endMarkerRef.current && shouldAutoScroll) {
        try {
          console.log(`🔧 [Layout] Initial scroll to bottom`);
          endMarkerRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        } catch (err) {
          console.error(`🚨 [Layout] Initial scroll error:`, err);
        }
      }
      
      // Log metrics
      if (container) {
        console.log(`📏 [Layout] Container metrics: scrollHeight=${container.scrollHeight}, clientHeight=${container.clientHeight}, difference=${container.scrollHeight - container.clientHeight}`);
      }
    }, 10);
    
    // Update debug info
    setDebugInfo({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      diff: container.scrollHeight - container.clientHeight
    });
  }, [maxHeight, content, shouldAutoScroll]);

  // Programmatic scroll to bottom
  const forceScrollToBottom = useCallback(() => {
    if (!scrollContainerRef.current || !endMarkerRef.current) return;
    
    console.log(`🆘 [Manual] Emergency scroll to bottom triggered`);
    setShouldAutoScroll(true);
    
    try {
      endMarkerRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      
      setTimeout(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        
        const maxScroll = container.scrollHeight - container.clientHeight;
        container.scrollTop = maxScroll;
        
        console.log(`🆘 [Manual] Emergency scroll complete - position: ${container.scrollTop}/${maxScroll}`);
        
        // Update debug info
        setDebugInfo({
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          diff: container.scrollHeight - container.clientHeight
        });
      }, 50);
    } catch (err) {
      console.error(`🚨 [Manual] Emergency scroll error:`, err);
    }
  }, []);

  if (!content) {
    console.log(`⚠️ No content provided to AnalysisDisplay`);
    return null;
  }

  return (
    <div className="relative">
      {/* Native scrollable div with explicit overflow behavior */}
      <div 
        ref={scrollContainerRef}
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full overflow-y-auto analysis-scroll-container"
        style={{ 
          height: maxHeight, 
          maxHeight,
          // Force scrollbar to always show to prevent layout shifts
          overflowY: 'scroll'
        }}
        data-streaming={isStreaming ? "true" : "false"}
        data-should-scroll={shouldAutoScroll ? "true" : "false"}
      >
        <div className="overflow-x-hidden w-full max-w-full analysis-content" data-testid="analysis-content">
          <ReactMarkdown 
            className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full"
          >
            {content || ""}
          </ReactMarkdown>
          
          {/* Debug visualization of container metrics - helpful for diagnosing scroll issues */}
          <div className="mt-4 pt-2 border-t border-dashed border-gray-700 text-xs text-gray-500">
            <div>Content Length: {content?.length || 0} chars</div>
            <div>Container Size: {debugInfo.scrollHeight}px / {debugInfo.clientHeight}px (diff: {debugInfo.diff}px)</div>
            <div>Scroll Position: {debugInfo.scrollTop}px / {Math.max(0, debugInfo.scrollHeight - debugInfo.clientHeight)}px</div>
            <div>Status: {isStreaming ? (streamStatus === 'waiting' ? 'Waiting for data' : 'Streaming') : 'Static'} | Scroll: {shouldAutoScroll ? 'Auto' : 'Manual'}</div>
          </div>
          
          {/* This is the element we'll scroll into view */}
          <div 
            id="content-end-marker" 
            ref={endMarkerRef} 
            style={{ height: '40px', paddingBottom: '40px', marginBottom: '40px' }} 
          />
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
      
      {!shouldAutoScroll && (
        <button 
          onClick={forceScrollToBottom}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
}
