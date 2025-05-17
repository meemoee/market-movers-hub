
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
  const plainTextRef = useRef<HTMLPreElement>(null);
  const shouldScrollRef = useRef<boolean>(true);
  const visibleContentRef = useRef<string>('');
  
  // Debug counters and metrics
  const renderCountRef = useRef<number>(0);
  const lastContentRef = useRef<string>("");
  
  // CRITICAL: Direct DOM manipulation for typewriter effect
  useEffect(() => {
    if (!isStreaming || !content || !plainTextRef.current) return;
    
    // Store the full content for reference
    const fullContent = content;
    
    // Reset visible content when streaming starts
    if (visibleContentRef.current.length > fullContent.length) {
      visibleContentRef.current = '';
    }
    
    // Don't re-render if we're already showing all content
    if (visibleContentRef.current === fullContent) {
      return;
    }

    let currentPosition = visibleContentRef.current.length;
    const targetElement = plainTextRef.current;
    
    console.log(`DIRECT_DOM: Starting typewriter from position ${currentPosition}/${fullContent.length}`);
    
    // Function to add characters with small delay
    const addCharacters = () => {
      // Don't continue if component unmounted or streaming stopped
      if (!plainTextRef.current || !isStreaming) return;
      
      // Calculate how many characters to show next (5 characters at a time)
      const charsToAdd = 5;
      const nextPosition = Math.min(currentPosition + charsToAdd, fullContent.length);
      
      // Update the visible content
      visibleContentRef.current = fullContent.substring(0, nextPosition);
      
      // Update DOM directly
      if (plainTextRef.current) {
        plainTextRef.current.textContent = visibleContentRef.current;
      }
      
      // Log progress occasionally
      if (nextPosition % 20 === 0 || nextPosition === fullContent.length) {
        console.log(`DIRECT_DOM: Updated to position ${nextPosition}/${fullContent.length}`);
      }
      
      // Scroll if needed
      if (containerRef.current && shouldScrollRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      
      // Continue if we haven't reached the end
      currentPosition = nextPosition;
      if (currentPosition < fullContent.length && isStreaming) {
        setTimeout(addCharacters, 10); // 10ms delay between updates
      } else {
        console.log(`DIRECT_DOM: Finished typewriter at position ${currentPosition}`);
      }
    };
    
    // Start adding characters
    addCharacters();
  }, [content, isStreaming]);
  
  // Track content updates for debugging
  useEffect(() => {
    if (content !== lastContentRef.current) {
      renderCountRef.current += 1;
      console.log(`STREAM_DISPLAY: New content update #${renderCountRef.current}, length: ${content.length}`);
      
      // Check if content was significantly increased
      if (content.length > lastContentRef.current.length + 50) {
        console.log(`STREAM_DISPLAY: Large content increase: +${content.length - lastContentRef.current.length} chars`);
      }
      
      lastContentRef.current = content;
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
  
  // Debug info
  const debugInfo = {
    contentLength: content.length,
    bufferLength: rawBuffer?.length || 0,
    displayPosition: displayPosition || 0,
    renderCount: renderCountRef.current,
    isStreaming,
    visibleLength: visibleContentRef.current.length
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
            <div>Position: {debugInfo.displayPosition}/{debugInfo.bufferLength}</div>
            <div>Visible: {debugInfo.visibleLength} chars</div>
            <div>Renders: {debugInfo.renderCount}</div>
            <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
          </div>
        </div>
        
        {/* Direct text display (manipulated by DOM) */}
        <div className="mb-4 p-2 bg-gray-800 dark:bg-gray-800 rounded text-xs overflow-auto max-h-32 text-gray-300">
          <pre 
            ref={plainTextRef} 
            className="whitespace-pre-wrap break-words"
          >
            {visibleContentRef.current || "(No content yet)"}
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
