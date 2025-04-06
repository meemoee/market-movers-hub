import { useLayoutEffect, useEffect, useState, useRef, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const renderCount = useRef(0)
  const scrollPositionLog = useRef<Array<{time: number, scrollTop: number, scrollHeight: number, isStreaming: boolean}>>([])
  const contentUpdateLog = useRef<Array<{time: number, length: number, delta: number, isStreaming: boolean, action: string}>>([])
  const effectLog = useRef<Array<{time: number, type: string, info: string}>>([])
  const rafCounts = useRef({requested: 0, executed: 0})
  
  useEffect(() => {
    renderCount.current += 1
    console.log(`🔄 AnalysisDisplay RENDER #${renderCount.current} - content length: ${content?.length}, isStreaming: ${isStreaming}, shouldAutoScroll: ${shouldAutoScroll}`);
    
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const scrollPercentage = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100)
      console.log(`📏 DOM Metrics: scrollTop=${scrollTop}, scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, percentage=${scrollPercentage}%`);
      
      scrollPositionLog.current.push({
        time: Date.now(),
        scrollTop,
        scrollHeight,
        isStreaming
      })
      
      if (scrollPositionLog.current.length > 50) {
        scrollPositionLog.current.shift()
      }
    }
    
    if (scrollRef.current) {
      console.log(`🔍 ScrollArea DOM structure:`, {
        ref: scrollRef.current,
        children: Array.from(scrollRef.current.children).map(child => ({
          tagName: child.tagName,
          className: (child as HTMLElement).className,
          childCount: child.childElementCount
        })),
        viewport: scrollRef.current.querySelector('[data-radix-scroll-area-viewport]'),
        scrollbar: scrollRef.current.querySelector('[data-radix-scroll-area-scrollbar]')
      });
    }
    
    return () => {
      console.log(`🧹 AnalysisDisplay cleanup for render #${renderCount.current}`);
    }
  });
  
  useEffect(() => {
    const currentLength = content?.length || 0
    const delta = currentLength - prevContentLength.current
    
    console.log(`📄 Content Update: current=${currentLength}, prev=${prevContentLength.current}, delta=${delta}, isStreaming=${isStreaming}`);
    
    contentUpdateLog.current.push({
      time: Date.now(),
      length: currentLength,
      delta,
      isStreaming,
      action: 'content-change'
    })
    
    if (contentUpdateLog.current.length > 50) {
      contentUpdateLog.current.shift()
    }
  }, [content, isStreaming])
  
  useEffect(() => {
    if (content && content !== "") {
      console.log(`📝 Content first 100 chars: "${content.substring(0, 100)}..."`);
      console.log(`📝 Content last 100 chars: "...${content.substring(content.length - 100)}"`);
      
      if (content.includes('```')) {
        console.log(`⚠️ Content contains code blocks which might affect rendering height`);
      }
    }
  }, [content]);
  
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) {
      console.log(`🛑 Skip scrolling - ref exists: ${!!scrollRef.current}, shouldAutoScroll: ${shouldAutoScroll}`);
      effectLog.current.push({
        time: Date.now(),
        type: 'layout-effect-skipped',
        info: `ref=${!!scrollRef.current}, autoScroll=${shouldAutoScroll}`
      })
      return;
    }
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    const delta = currentContentLength - prevContentLength.current
    
    console.log(`🔄 useLayoutEffect scroll check - delta: ${delta}, shouldScroll: ${shouldAutoScroll}, isStreaming: ${isStreaming}`);
    effectLog.current.push({
      time: Date.now(),
      type: 'layout-effect-run',
      info: `delta=${delta}, autoScroll=${shouldAutoScroll}, streaming=${isStreaming}`
    })
    
    if (delta > 0 || isStreaming) {
      console.log(`📜 Attempting to scroll - content delta: ${delta}, isStreaming: ${isStreaming}`);
      
      rafCounts.current.requested++;
      const rafId = requestAnimationFrame(() => {
        rafCounts.current.executed++;
        if (scrollContainer) {
          const beforeScrollTop = scrollContainer.scrollTop;
          const beforeScrollHeight = scrollContainer.scrollHeight;
          
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          
          const afterScrollTop = scrollContainer.scrollTop;
          const afterScrollHeight = scrollContainer.scrollHeight;
          
          console.log(`📜 Scroll attempt result: 
            Before: scrollTop=${beforeScrollTop}, scrollHeight=${beforeScrollHeight}
            After: scrollTop=${afterScrollTop}, scrollHeight=${afterScrollHeight}
            Delta: scrollTop=${afterScrollTop - beforeScrollTop}, scrollHeight=${afterScrollHeight - beforeScrollHeight}
            RAF ID: ${rafId}, isStreaming: ${isStreaming}
          `);
          
          contentUpdateLog.current.push({
            time: Date.now(),
            length: currentContentLength,
            delta,
            isStreaming,
            action: 'scroll-adjustment'
          })
        }
        setLastUpdateTime(Date.now())
      })
      
      if (isStreaming) {
        setStreamStatus('streaming')
      }
      
      return () => {
        console.log(`🧯 Cleaning up RAF ID: ${rafId}`);
        cancelAnimationFrame(rafId);
      }
    }
    
    prevContentLength.current = currentContentLength
  }, [content, isStreaming, shouldAutoScroll])
  
  useEffect(() => {
    if (!scrollRef.current) {
      console.log(`🛑 Skip scroll listener - no ref`);
      return;
    }
    
    const scrollContainer = scrollRef.current
    const handleScroll = () => {
      if (!scrollContainer) return;
      
      const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const currentScrollTop = scrollContainer.scrollTop;
      const isAtBottom = Math.abs(maxScrollTop - currentScrollTop) < 30;
      
      console.log(`📜 Scroll event - position: ${currentScrollTop}/${maxScrollTop} (${Math.round((currentScrollTop/maxScrollTop)*100)}%), isAtBottom: ${isAtBottom}`);
      
      if (shouldAutoScroll !== isAtBottom) {
        console.log(`🔄 Auto-scroll changed to ${isAtBottom} from user scroll`);
        setShouldAutoScroll(isAtBottom);
        
        effectLog.current.push({
          time: Date.now(),
          type: 'scroll-user-action',
          info: `scrollTop=${currentScrollTop}, maxScroll=${maxScrollTop}, isAtBottom=${isAtBottom}`
        })
      }
    }
    
    console.log(`👂 Adding scroll event listener`);
    scrollContainer.addEventListener('scroll', handleScroll)
    return () => {
      console.log(`🧹 Removing scroll event listener`);
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [shouldAutoScroll])
  
  const markdownStartTime = useRef(0)
  
  const beforeMarkdownRender = () => {
    markdownStartTime.current = performance.now()
    console.log(`⏱️ Starting markdown rendering - content length: ${content?.length || 0}`);
  }
  
  const afterMarkdownRender = () => {
    const duration = performance.now() - markdownStartTime.current
    console.log(`⏱️ Markdown rendering completed in ${duration.toFixed(2)}ms`);
  }
  
  const forceScrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    
    console.log(`🆘 Emergency scroll to bottom triggered`);
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    
    setShouldAutoScroll(true);
    effectLog.current.push({
      time: Date.now(),
      type: 'manual-scroll-bottom',
      info: 'User requested scroll to bottom'
    })
  }, []);
  
  useEffect(() => {
    if (!isStreaming || !scrollRef.current || !shouldAutoScroll) {
      console.log(`🛑 Skip continuous scroll - streaming: ${isStreaming}, ref: ${!!scrollRef.current}, autoScroll: ${shouldAutoScroll}`);
      return;
    }
    
    console.log(`🔄 Setting up continuous scroll interval for streaming`);
    
    const intervalId = setInterval(() => {
      if (scrollRef.current && shouldAutoScroll) {
        const beforeScrollTop = scrollRef.current.scrollTop;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        const afterScrollTop = scrollRef.current.scrollTop;
        
        console.log(`🔄 Interval scroll adjustment: ${beforeScrollTop} -> ${afterScrollTop} (delta: ${afterScrollTop - beforeScrollTop})`);
      }
    }, 300);
    
    return () => {
      console.log(`🧹 Clearing continuous scroll interval`);
      clearInterval(intervalId);
    }
  }, [isStreaming, shouldAutoScroll]);
  
  useEffect(() => {
    console.log(`📊 RAF stats - requested: ${rafCounts.current.requested}, executed: ${rafCounts.current.executed}, ratio: ${(rafCounts.current.executed/rafCounts.current.requested).toFixed(2)}`);
    
    const intervalId = setInterval(() => {
      if (rafCounts.current.requested > 0) {
        console.log(`📊 RAF stats periodic - requested: ${rafCounts.current.requested}, executed: ${rafCounts.current.executed}, ratio: ${(rafCounts.current.executed/rafCounts.current.requested).toFixed(2)}`);
      }
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      if (streamStatus !== 'idle') {
        console.log(`🔄 Stream status changed to idle from ${streamStatus}`);
        setStreamStatus('idle');
      }
      return;
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime
      const newStatus = timeSinceUpdate > 1500 ? 'waiting' : 'streaming';
      
      if (streamStatus !== newStatus) {
        console.log(`🔄 Stream status changed to ${newStatus} from ${streamStatus}, time since update: ${timeSinceUpdate}ms`);
        setStreamStatus(newStatus);
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isStreaming, lastUpdateTime, streamStatus])

  useEffect(() => {
    return () => {
      console.log(`📊 ANALYSIS DISPLAY LOG DUMP ON UNMOUNT`);
      console.log(`📊 Scroll positions (${scrollPositionLog.current.length})`, scrollPositionLog.current);
      console.log(`📊 Content updates (${contentUpdateLog.current.length})`, contentUpdateLog.current);
      console.log(`📊 Effect executions (${effectLog.current.length})`, effectLog.current);
      console.log(`📊 Final RAF stats - requested: ${rafCounts.current.requested}, executed: ${rafCounts.current.executed}`);
    };
  }, []);
  
  useEffect(() => {
    if (!content) {
      console.log(`⚠️ Content is empty or undefined`);
    }
  }, [content]);

  if (!content) {
    console.log(`⚠️ Rendering null - no content provided`);
    return null;
  }

  console.log(`🏗️ Rendering with ScrollArea - maxHeight: ${maxHeight}, isStreaming: ${isStreaming}, streamStatus: ${streamStatus}`);

  beforeMarkdownRender();

  return (
    <div className="relative">
      <ScrollArea 
        className={`rounded-md border p-4 bg-accent/5 w-full max-w-full analysis-scroll-container`}
        style={{ height: maxHeight }}
        ref={scrollRef}
        data-streaming={isStreaming ? "true" : "false"}
        data-should-scroll={shouldAutoScroll ? "true" : "false"}
      >
        <div className="overflow-x-hidden w-full max-w-full analysis-content" data-testid="analysis-content">
          <ReactMarkdown 
            className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full"
            components={{
              p: ({ node, ...props }) => {
                const isLastParagraph = node.position?.end.offset === content.length;
                if (isLastParagraph) {
                  console.log(`🏁 Rendered last paragraph - offset: ${node.position?.end.offset}`);
                }
                return <p {...props} />;
              }
            }}
          >
            {content}
          </ReactMarkdown>
          <div id="content-end-marker" style={{ height: '1px' }} />
        </div>
        {afterMarkdownRender()}
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
      
      {!shouldAutoScroll && isStreaming && (
        <button 
          onClick={forceScrollToBottom}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
      
      <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-black/50 px-1 py-0.5 rounded opacity-50 hover:opacity-100">
        {content?.length || 0} chars | {isStreaming ? 'streaming' : 'static'} | {shouldAutoScroll ? 'auto' : 'manual'}
      </div>
    </div>
  )
}
