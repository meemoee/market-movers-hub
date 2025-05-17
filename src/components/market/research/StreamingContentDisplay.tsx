
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const shouldScrollRef = useRef<boolean>(true);
  
  // Debug counters and metrics
  const renderCountRef = useRef<number>(0);
  const lastContentRef = useRef<string>("");
  const lastContentLengthRef = useRef<number>(0);
  
  // Track content updates for debugging with more detail
  useEffect(() => {
    if (content !== lastContentRef.current) {
      renderCountRef.current += 1;
      const prevLength = lastContentRef.current.length;
      const newLength = content.length;
      const difference = newLength - prevLength;
      
      console.log(`STREAM_DISPLAY: Content update #${renderCountRef.current}`);
      console.log(`STREAM_DISPLAY: Length changed from ${prevLength} to ${newLength} (delta: ${difference})`);
      
      if (difference > 0 && difference < 100) {
        // Show the actual new content that was added for debugging
        console.log(`STREAM_DISPLAY: New content added: "${content.substring(prevLength)}"`);
      }
      
      lastContentRef.current = content;
      lastContentLengthRef.current = newLength;
    }
  }, [content]);

  // CRITICAL: Scroll to bottom when content changes if auto-scroll is enabled
  useEffect(() => {
    if (containerRef.current && shouldScrollRef.current) {
      const prevScroll = containerRef.current.scrollTop;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      const newScroll = containerRef.current.scrollTop;
      
      console.log(`STREAM_DISPLAY: Scrolled from ${prevScroll} to ${newScroll}, height: ${containerRef.current.scrollHeight}`);
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
      
      console.log(`STREAM_DISPLAY: User scroll - ${scrollTop}/${scrollHeight}, auto-scroll: ${isAtBottom}`);
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
  
  // Show raw text for debugging
  const plainTextContent = content || "(No content)";
  const debugInfo = {
    contentLength: content.length,
    bufferLength: rawBuffer?.length || 0,
    displayPosition: displayPosition || 0,
    renderCount: renderCountRef.current,
    isStreaming,
  };

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full overflow-y-auto"
        style={{ height: maxHeight, maxHeight }}
      >
        {/* Debug bar at the top */}
        <div className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div>Content: {debugInfo.contentLength} chars</div>
            <div>Buffer: {debugInfo.bufferLength} chars</div>
            <div>Position: {debugInfo.displayPosition}/{debugInfo.bufferLength}</div>
            <div>Renders: {debugInfo.renderCount}</div>
            <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
            <div>Delta: {debugInfo.bufferLength - debugInfo.displayPosition}</div>
          </div>
        </div>
        
        {/* Direct raw text display for immediate feedback */}
        <div className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-32">
          <pre className="whitespace-pre-wrap break-words">{plainTextContent}</pre>
        </div>
        
        {/* Main content display with ReactMarkdown */}
        <div 
          ref={contentRef}
          className="text-sm whitespace-pre-wrap break-words w-full max-w-full"
        >
          <ReactMarkdown>
            {content}
          </ReactMarkdown>
        </div>
      </div>
      
      {/* Streaming indicators */}
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
