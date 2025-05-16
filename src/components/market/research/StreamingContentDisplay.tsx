
import { useEffect, useRef, useState } from 'react';
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
  
  // Track the last rendered content length to determine what's new
  const lastRenderedLengthRef = useRef<number>(0);

  // Effect to handle direct DOM updates for streaming content
  useEffect(() => {
    if (!contentRef.current) return;
    
    // Only update the DOM if the content has changed
    if (content !== lastContentRef.current) {
      // Store the new content
      lastContentRef.current = content;
      
      // Update the content directly in the DOM
      if (isStreaming) {
        // For streaming, we want to APPEND only the new content, not replace it all
        const newContentPortion = content.substring(lastRenderedLengthRef.current);
        
        if (newContentPortion.length > 0) {
          // Create a new text node with just the new portion
          const newNode = document.createTextNode(newContentPortion);
          
          // Append only the new text to the content div
          contentRef.current.appendChild(newNode);
          
          // Update the last rendered length
          lastRenderedLengthRef.current = content.length;
          
          console.log(`Appended ${newContentPortion.length} new characters`);
        }
      } else {
        // When not streaming, we can just set the full content
        contentRef.current.textContent = content;
        lastRenderedLengthRef.current = content.length;
      }
      
      // Scroll to bottom if auto-scroll is enabled
      if (shouldScrollRef.current && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
  }, [content, isStreaming]);

  // Reset the last rendered length when streaming starts
  useEffect(() => {
    if (isStreaming) {
      lastRenderedLengthRef.current = 0;
      if (contentRef.current) {
        // Clear content when streaming starts
        contentRef.current.textContent = '';
      }
    }
  }, [isStreaming]);

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
          {/* Content is managed imperatively via the ref */}
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
