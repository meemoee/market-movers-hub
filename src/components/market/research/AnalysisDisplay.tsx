import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const autoScrollTimeoutRef = useRef<number | null>(null)
  
  // Debug logging (we'll keep this minimal)
  useEffect(() => {
    if (content?.length > 0 && Math.abs(content.length - prevContentLength.current) > 100) {
      console.log(`AnalysisDisplay: Content updated - delta: ${content.length - prevContentLength.current}`);
    }
  }, [content]);
  
  // Clear any existing auto-scroll timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        window.clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    };
  }, []);
  
  // Optimize scrolling with less frequent updates and better cleanup
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return;
    
    const scrollContainer = scrollRef.current;
    const currentContentLength = content?.length || 0;
    
    // Only auto-scroll if content is growing or streaming
    if (currentContentLength > prevContentLength.current || isStreaming) {
      // Clear any existing timeout to prevent stacking callbacks
      if (autoScrollTimeoutRef.current) {
        window.clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
      
      // Use requestAnimationFrame for smoother scrolling
      const scrollToBottom = () => {
        if (scrollContainer) {
          const viewport = scrollContainer.querySelector('[data-radix-scroll-area-viewport]');
          if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
          }
          setLastUpdateTime(Date.now());
        }
      };
      
      // Debounce scroll updates
      autoScrollTimeoutRef.current = window.setTimeout(() => {
        requestAnimationFrame(scrollToBottom);
        autoScrollTimeoutRef.current = null;
      }, 50); // Small delay to batch scrolling updates
    }
    
    prevContentLength.current = currentContentLength;
  }, [content, isStreaming, shouldAutoScroll]);
  
  // Handle user scroll to disable auto-scroll with improved detection
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    
    const viewport = container.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    
    // More efficient scroll handler with improved threshold detection
    const handleScroll = () => {
      if (!viewport) return;
      
      // Calculate distance from bottom with improved precision
      const scrollBottom = viewport.scrollHeight - viewport.clientHeight;
      const distanceFromBottom = Math.abs(scrollBottom - viewport.scrollTop);
      const isAtBottom = distanceFromBottom < 50; // Slightly larger threshold
      
      if (shouldAutoScroll !== isAtBottom) {
        setShouldAutoScroll(isAtBottom);
      }
    };
    
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [shouldAutoScroll]);
  
  // Check for inactive streaming with more efficient timing logic
  useEffect(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        setStreamStatus('idle');
      }
      return;
    }
    
    const checkStreamStatus = () => {
      const timeSinceUpdate = Date.now() - lastUpdateTime;
      const newStatus = timeSinceUpdate > 1500 ? 'waiting' : 'streaming';
      
      if (streamStatus !== newStatus) {
        setStreamStatus(newStatus);
      }
    };
    
    const interval = setInterval(checkStreamStatus, 1000);
    
    return () => clearInterval(interval);
  }, [isStreaming, lastUpdateTime, streamStatus]);

  // Don't render anything when empty content
  if (!content) return null;

  return (
    <div className="relative">
      <ScrollArea 
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full"
        style={{ height: maxHeight }}
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {content}
          </ReactMarkdown>
        </div>
      </ScrollArea>
      
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
          onClick={() => {
            setShouldAutoScroll(true);
            const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
              viewport.scrollTop = viewport.scrollHeight;
            }
          }}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
}
