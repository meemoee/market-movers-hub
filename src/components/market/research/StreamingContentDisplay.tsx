import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from "@/components/ui/scroll-area";

interface StreamingContentDisplayProps {
  content: string;
  isStreaming: boolean;
  maxHeight?: string | number;
}

export function StreamingContentDisplay({ 
  content, 
  isStreaming, 
  maxHeight = "200px" 
}: StreamingContentDisplayProps) {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef<string>('');
  const shouldScrollRef = useRef<boolean>(true);

  // Effect to handle direct DOM updates for streaming content
  useEffect(() => {
    if (!contentRef.current) return;
    
    // Only update the DOM if the content has changed
    if (content !== lastContentRef.current) {
      // Store the new content
      lastContentRef.current = content;
      
      // Update the content directly in the DOM
      if (isStreaming) {
        // For streaming, we want to update the content directly
        contentRef.current.textContent = content;
      }
      
      // Scroll to bottom if auto-scroll is enabled
      if (shouldScrollRef.current && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
  }, [content, isStreaming]);

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

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full overflow-y-auto"
        style={{ height: maxHeight, maxHeight }}
      >
        <div 
          ref={contentRef}
          className="text-sm whitespace-pre-wrap break-words w-full max-w-full"
        >
          {content}
        </div>
      </div>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              Streaming...
            </span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-75" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-150" />
            </div>
          </div>
        </div>
      )}
      
      {!shouldScrollRef.current && isStreaming && (
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
