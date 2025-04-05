
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface StreamingContentViewProps {
  children: React.ReactNode;
  className?: string;
  maxHeight?: string | number;
  isStreaming?: boolean;
  shouldScrollToBottom?: boolean;
  onScrollToBottom?: () => void;
  onScrollAwayFromBottom?: () => void;
}

export function StreamingContentView({
  children,
  className,
  maxHeight = "200px",
  isStreaming = false,
  shouldScrollToBottom = true,
  onScrollToBottom,
  onScrollAwayFromBottom
}: StreamingContentViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomMarkerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const lastScrollHeightRef = useRef<number>(0);
  const lastScrollTopRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  
  // Handle user scrolling detection
  const handleScroll = () => {
    if (!containerRef.current) return;
    
    // Store scroll position
    lastScrollTopRef.current = containerRef.current.scrollTop;
    
    // Calculate if we're near the bottom (within 10px)
    const scrollHeight = containerRef.current.scrollHeight;
    const clientHeight = containerRef.current.clientHeight;
    const scrollTop = containerRef.current.scrollTop;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const newAtBottom = distanceFromBottom < 10;
    
    // Only consider it a user scroll if not already at bottom and scroll event is not from auto-scrolling
    if (!newAtBottom && !isStreaming) {
      setUserHasScrolled(true);
    } 
    
    // If user scrolls back to bottom, reset userHasScrolled flag
    if (newAtBottom && userHasScrolled) {
      setUserHasScrolled(false);
      onScrollToBottom?.();
    }
    
    // Update atBottom state if changed
    if (newAtBottom !== atBottom) {
      setAtBottom(newAtBottom);
      if (newAtBottom) {
        onScrollToBottom?.();
      } else {
        onScrollAwayFromBottom?.();
      }
    }
    
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set a timeout to determine if user has finished scrolling
    scrollTimeoutRef.current = setTimeout(() => {
      console.log("Scroll idle detected");
      scrollTimeoutRef.current = null;
    }, 100);
  };
  
  // Set up mutation observer to detect content changes
  useEffect(() => {
    if (!contentRef.current) return;
    
    // Track if we need to maintain scroll position
    const handleContentMutation = () => {
      if (!containerRef.current) return;
      
      const scrollHeight = containerRef.current.scrollHeight;
      
      // If height changed and we should auto-scroll or we're actively streaming
      if (scrollHeight !== lastScrollHeightRef.current) {
        console.log(`Content height changed from ${lastScrollHeightRef.current} to ${scrollHeight}`);
        
        requestAnimationFrame(() => {
          // If streaming or we should auto-scroll and user hasn't manually scrolled away
          if (containerRef.current && ((shouldScrollToBottom && !userHasScrolled) || (isStreaming && atBottom))) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            console.log("Auto-scrolled to bottom after content change");
          }
          
          lastScrollHeightRef.current = containerRef.current?.scrollHeight || 0;
        });
      }
    };
    
    // Create and attach observer
    mutationObserverRef.current = new MutationObserver(handleContentMutation);
    mutationObserverRef.current.observe(contentRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });
    
    return () => {
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      }
    };
  }, [shouldScrollToBottom, isStreaming, atBottom, userHasScrolled]);
  
  // Force scroll to bottom when streaming starts or when isStreaming/shouldScrollToBottom changes
  useEffect(() => {
    if (containerRef.current) {
      const shouldForceScroll = isStreaming || shouldScrollToBottom;
      
      if (shouldForceScroll && !userHasScrolled) {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            lastScrollHeightRef.current = containerRef.current.scrollHeight;
            console.log(`Force scrolled to bottom due to props change: isStreaming=${isStreaming}, shouldScrollToBottom=${shouldScrollToBottom}`);
          }
        });
      }
    }
    
    // Reset user scrolled flag if streaming stops
    if (!isStreaming) {
      setUserHasScrolled(false);
    }
  }, [isStreaming, shouldScrollToBottom]);

  // Manual scroll to bottom handler
  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAtBottom(true);
      setUserHasScrolled(false);
      onScrollToBottom?.();
      
      console.log("Manually scrolled to bottom");
    }
  };

  return (
    <div className="relative w-full">
      <div 
        ref={containerRef}
        className={cn(
          "overflow-y-auto overflow-x-hidden w-full scroll-smooth",
          className
        )}
        style={{ maxHeight, height: maxHeight }}
        onScroll={handleScroll}
      >
        <div ref={contentRef} className="w-full max-w-full">
          {children}
        </div>
        <div ref={bottomMarkerRef} style={{ height: "1px", width: "100%" }} />
      </div>
      
      {(!atBottom || userHasScrolled) && (
        <Button 
          onClick={scrollToBottom}
          variant="outline" 
          size="sm" 
          className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm flex items-center gap-1 py-1 px-2 h-auto z-10"
        >
          <ChevronDown className="h-3 w-3" />
          <span className="text-xs">Scroll down</span>
        </Button>
      )}
    </div>
  );
}
