import { useLayoutEffect, useRef, useEffect, useState, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [displayedContent, setDisplayedContent] = useState(content || '')
  const lastUpdateRef = useRef(Date.now())
  const animationFrameRef = useRef<number | null>(null)
  
  // Update displayed content with minimal debounce to ensure smooth UI updates
  useEffect(() => {
    if (content !== displayedContent) {
      // If content has changed and it's been at least 16ms since last update (≈60fps)
      if (Date.now() - lastUpdateRef.current >= 16) {
        setDisplayedContent(content);
        lastUpdateRef.current = Date.now();
      } else {
        // Otherwise schedule an update in the next animation frame
        if (animationFrameRef.current === null) {
          animationFrameRef.current = requestAnimationFrame(() => {
            setDisplayedContent(content);
            lastUpdateRef.current = Date.now();
            animationFrameRef.current = null;
          });
        }
      }
    }
  }, [content, displayedContent]);
  
  // Force periodic re-renders during streaming to ensure content updates
  useEffect(() => {
    if (!isStreaming) return;
    
    const interval = setInterval(() => {
      if (content !== displayedContent) {
        setDisplayedContent(content);
        lastUpdateRef.current = Date.now();
      }
    }, 100); // Check more frequently to catch any updates
    
    return () => clearInterval(interval);
  }, [isStreaming, content, displayedContent]);
  
  // Auto-scroll logic with useLayoutEffect to ensure it happens before paint
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);
  
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    
    const currentContentLength = displayedContent?.length || 0;
    
    // Always scroll to bottom during streaming or when content grows
    if (isStreaming || currentContentLength > prevContentLength.current) {
      scrollToBottom();
    }
    
    prevContentLength.current = currentContentLength;
  }, [displayedContent, isStreaming, scrollToBottom]);
  
  // Ensure continuous scrolling during streaming with requestAnimationFrame
  useEffect(() => {
    if (!isStreaming || !scrollRef.current) return;
    
    let frameId: number;
    const scrollLoop = () => {
      scrollToBottom();
      frameId = requestAnimationFrame(scrollLoop);
    };
    
    frameId = requestAnimationFrame(scrollLoop);
    
    return () => {
      cancelAnimationFrame(frameId);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isStreaming, scrollToBottom]);

  if (!displayedContent && !isStreaming) return null;

  return (
    <div className="relative">
      <ScrollArea 
        className="h-[200px] rounded-md border p-4 bg-accent/5"
        ref={scrollRef}
      >
        <div className="overflow-x-hidden w-full prose-pre:whitespace-pre-wrap">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2">
            {displayedContent || (isStreaming ? 'Loading analysis...' : '')}
          </ReactMarkdown>
        </div>
      </ScrollArea>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex space-x-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-150" />
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-300" />
          </div>
        </div>
      )}
    </div>
  );
}
