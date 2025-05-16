
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from "@/components/ui/scroll-area";

interface StreamingContentDisplayProps {
  content: string;
  isStreaming: boolean;
  maxHeight?: string | number;
  rawBuffer?: string;  // Optional access to raw buffer for debugging
  displayPosition?: number; // Optional access to display position for debugging
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
  
  // State to show debug info (always visible for debugging)
  const [showDebugInfo, setShowDebugInfo] = useState(true);
  
  // Debug state to count content updates
  const [updateCount, setUpdateCount] = useState(0);
  const prevContentRef = useRef<string>("");
  
  // Track content length changes
  useEffect(() => {
    if (content !== prevContentRef.current) {
      setUpdateCount(prev => prev + 1);
      prevContentRef.current = content;
      console.log(`StreamingContentDisplay: Content updated, length: ${content.length} (update #${updateCount + 1})`);
    }
  }, [content]);

  // Scroll to bottom when content changes if auto-scroll is enabled
  useEffect(() => {
    if (contentRef.current && containerRef.current && shouldScrollRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
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

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className="rounded-md border p-4 bg-accent/5 w-full max-w-full overflow-y-auto"
        style={{ height: maxHeight, maxHeight }}
      >
        {/* Main content display - using pre instead of ReactMarkdown for debugging */}
        <div 
          ref={contentRef}
          className="text-sm whitespace-pre-wrap break-words w-full max-w-full"
        >
          {content ? (
            <>
              {/* For debugging, show raw text first */}
              <pre className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-32">
                {content.substring(0, 200)}{content.length > 200 ? "..." : ""}
              </pre>
              
              {/* Then show the markdown rendering */}
              <ReactMarkdown>
                {content}
              </ReactMarkdown>
            </>
          ) : isStreaming ? (
            <span className="text-muted-foreground italic">Waiting for content...</span>
          ) : (
            <span className="text-muted-foreground">No content to display</span>
          )}
        </div>
        
        {/* Debug information overlay (always visible) */}
        {showDebugInfo && (
          <div className="mt-4 p-2 border-t border-dashed border-gray-500 text-xs">
            <div className="font-mono">
              <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
              <div>Content length: {content.length} chars</div>
              <div>Content updates: {updateCount}</div>
              {rawBuffer !== undefined && (
                <div>Raw buffer: {rawBuffer.length} chars</div>
              )}
              {displayPosition !== undefined && (
                <div>Display position: {displayPosition}/{rawBuffer?.length || 0}</div>
              )}
              <div>
                Segments: {content.split('\n\n').length}, 
                Lines: {content.split('\n').length}
              </div>
              <div className="mt-1">
                First 50 chars: "{content.substring(0, 50)}{content.length > 50 ? "..." : ""}"
              </div>
            </div>
          </div>
        )}
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
