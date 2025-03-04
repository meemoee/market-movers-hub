
import { useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisDisplay({ content, isStreaming = false }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [displayedContent, setDisplayedContent] = useState(content || '')
  
  // Update content with minimal debounce for streaming
  useEffect(() => {
    if (content !== displayedContent) {
      // Use requestAnimationFrame for smooth updates
      const frame = requestAnimationFrame(() => {
        setDisplayedContent(content);
      });
      
      return () => cancelAnimationFrame(frame);
    }
  }, [content, displayedContent]);
  
  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (!isStreaming || !scrollRef.current) return;
    
    // Scroll when content changes
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    
    scrollToBottom();
    
    // Also create a continuous scroll loop during streaming
    let frameId: number | null = null;
    
    if (isStreaming) {
      const scrollLoop = () => {
        scrollToBottom();
        frameId = requestAnimationFrame(scrollLoop);
      };
      
      frameId = requestAnimationFrame(scrollLoop);
    }
    
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isStreaming, displayedContent]);

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
