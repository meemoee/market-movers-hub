
import { useCallback, useEffect, useRef, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'
import { Button } from "@/components/ui/button"
import { ArrowDown } from "lucide-react"

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
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const prevContentLengthRef = useRef<number>(0)
  const observerRef = useRef<MutationObserver | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const userHasScrolledRef = useRef<boolean>(false)
  
  // Debug logging for content updates
  useEffect(() => {
    if (content && content.length > 0) {
      console.log(`AnalysisDisplay: Content updated - length: ${content.length}, isStreaming: ${isStreaming}`);
      
      // Update last update time when content changes during streaming
      if (isStreaming && content.length > prevContentLengthRef.current) {
        setLastUpdateTime(Date.now())
      }
      
      prevContentLengthRef.current = content.length
    }
  }, [content, isStreaming]);

  // Scroll to bottom function with multiple aggressive attempts
  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScroll || !containerRef.current || userHasScrolledRef.current) return;
    
    const scrollContainer = containerRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (!scrollContainer) return;
    
    console.log("Attempting to scroll to bottom");
    
    // Clear any existing timeout to avoid conflicting scroll attempts
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    // Make multiple scroll attempts with increasing delays
    const scrollTimes = [0, 10, 50, 100, 300];
    
    scrollTimes.forEach(delay => {
      scrollTimeoutRef.current = setTimeout(() => {
        if (scrollContainer && shouldAutoScroll && !userHasScrolledRef.current) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          console.log(`Scrolled to bottom with delay ${delay}ms - height: ${scrollContainer.scrollHeight}`);
        }
      }, delay);
    });
  }, [shouldAutoScroll]);

  // Set up mutation observer to detect content changes
  useEffect(() => {
    if (!contentRef.current) return;
    
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    // Create a new mutation observer
    observerRef.current = new MutationObserver((mutations) => {
      let shouldScroll = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          shouldScroll = true;
        }
      });
      
      if (shouldScroll && shouldAutoScroll && !userHasScrolledRef.current) {
        scrollToBottom();
      }
    });
    
    // Start observing content changes
    observerRef.current.observe(contentRef.current, {
      childList: true,
      characterData: true,
      subtree: true
    });
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [scrollToBottom, shouldAutoScroll]);

  // Force initial scroll when content or streaming status changes
  useEffect(() => {
    if (isStreaming && content && content.length > 0) {
      scrollToBottom();
    }
  }, [content, isStreaming, scrollToBottom]);

  // Manually trigger scroll to bottom on initial load and content change
  useEffect(() => {
    if (content && content.length > 0) {
      scrollToBottom();
    }
  }, [content, scrollToBottom]);

  // Handle user scroll to enable/disable auto-scroll
  useEffect(() => {
    const scrollContainer = containerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (!scrollContainer) return;

    const handleScroll = () => {
      // Check if scrollable at all
      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
        userHasScrolledRef.current = false;
        if (!shouldAutoScroll) {
          setShouldAutoScroll(true);
        }
        return;
      }

      const isAtBottom = Math.abs((scrollContainer.scrollHeight - scrollContainer.clientHeight) - scrollContainer.scrollTop) < 30;
      
      if (shouldAutoScroll !== isAtBottom) {
        console.log(`User scroll detected - at bottom: ${isAtBottom}`);
        setShouldAutoScroll(isAtBottom);
        userHasScrolledRef.current = !isAtBottom;
      }
    };
    
    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [shouldAutoScroll]);

  // Handle streaming status updates
  useEffect(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        setStreamStatus('idle');
      }
      return;
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime;
      const newStatus = timeSinceUpdate > 1500 ? 'waiting' : 'streaming';
      
      if (streamStatus !== newStatus) {
        setStreamStatus(newStatus);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isStreaming, lastUpdateTime, streamStatus]);

  // Reset user scroll state when content is completely changed
  useEffect(() => {
    if (content.length === 0) {
      userHasScrolledRef.current = false;
      setShouldAutoScroll(true);
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className="relative" ref={containerRef}>
      <ScrollArea 
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full"
        style={{ height: maxHeight }}
      >
        <div className="overflow-x-hidden w-full max-w-full" ref={contentRef}>
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
      
      {(!shouldAutoScroll || userHasScrolledRef.current) && isStreaming && (
        <Button 
          onClick={() => {
            userHasScrolledRef.current = false;
            setShouldAutoScroll(true);
            scrollToBottom();
          }}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors flex items-center gap-1"
          size="sm"
          variant="ghost"
        >
          <ArrowDown className="h-3 w-3" />
          Resume auto-scroll
        </Button>
      )}
    </div>
  );
}
