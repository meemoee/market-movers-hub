
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface StreamingContentDisplayProps {
  content: string;
  isStreaming: boolean;
  maxHeight?: string;
  rawBuffer?: string;
  displayPosition?: number;
}

export function StreamingContentDisplay({ 
  content,
  isStreaming,
  maxHeight = 'auto',
  rawBuffer,
  displayPosition
}: StreamingContentDisplayProps) {
  // Ref to scroll container
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState({
    contentLength: 0,
    bufferLength: 0,
    displayPosition: 0,
    renderCount: 0
  });
  
  // Track render count for debugging
  const renderCountRef = useRef(0);
  
  // Whenever content changes, scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    
    // Update debug info
    renderCountRef.current++;
    setDebugInfo({
      contentLength: content.length,
      bufferLength: rawBuffer?.length || 0,
      displayPosition: displayPosition || 0,
      renderCount: renderCountRef.current
    });
  }, [content, rawBuffer, displayPosition]);

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className="overflow-auto prose prose-invert prose-sm max-w-none"
        style={{ maxHeight }}
      >
        {isStreaming && (
          <div className="flex items-center space-x-2 mb-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>Streaming...</span>
          </div>
        )}
        
        <ReactMarkdown>{content}</ReactMarkdown>
        
        {isStreaming && content && (
          <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1"></span>
        )}
      </div>
      
      {/* Debug overlay - only visible in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs p-1 rounded opacity-70 hover:opacity-100">
          <div>Content: {debugInfo.contentLength} chars</div>
          <div>Buffer: {debugInfo.bufferLength} chars</div>
          <div>Display: {debugInfo.displayPosition} chars</div>
          <div>Renders: {debugInfo.renderCount}</div>
          <div>Delta: {debugInfo.bufferLength - debugInfo.displayPosition} chars</div>
        </div>
      )}
    </div>
  );
}
