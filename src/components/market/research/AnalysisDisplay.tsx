
import { useLayoutEffect, useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from 'react-markdown'
import { Badge } from "@/components/ui/badge"
import { Braces, Database, ChevronsDown } from "lucide-react"

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
}

export function AnalysisDisplay({ 
  content, 
  isStreaming = false, 
  maxHeight = "300px" 
}: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevContentLength = useRef(content?.length || 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamStatus, setStreamStatus] = useState<'streaming' | 'waiting' | 'idle'>('idle')
  const [showFullCode, setShowFullCode] = useState<{[key: string]: boolean}>({})
  
  // Optimize scrolling with less frequent updates
  useLayoutEffect(() => {
    if (!scrollRef.current || !shouldAutoScroll) return
    
    const scrollContainer = scrollRef.current
    const currentContentLength = content?.length || 0
    
    // Only auto-scroll if content is growing or streaming
    if (currentContentLength > prevContentLength.current || isStreaming) {
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
        setLastUpdateTime(Date.now())
      })
      
      if (isStreaming) {
        setStreamStatus('streaming')
      }
    }
    
    prevContentLength.current = currentContentLength
  }, [content, isStreaming, shouldAutoScroll])
  
  // Handle user scroll to disable auto-scroll
  useEffect(() => {
    if (!scrollRef.current) return
    
    const scrollContainer = scrollRef.current
    const handleScroll = () => {
      // If user has scrolled up, disable auto-scroll
      // If they scroll to the bottom, re-enable it
      const isAtBottom = Math.abs(
        (scrollContainer.scrollHeight - scrollContainer.clientHeight) - 
        scrollContainer.scrollTop
      ) < 30 // Small threshold for "close enough" to bottom
      
      setShouldAutoScroll(isAtBottom)
    }
    
    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])
  
  // Check for inactive streaming with longer intervals
  useEffect(() => {
    if (!isStreaming) {
      setStreamStatus('idle')
      return
    }
    
    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTime
      if (timeSinceUpdate > 1500) {
        setStreamStatus('waiting')
      } else if (streamStatus !== 'streaming') {
        setStreamStatus('streaming')
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isStreaming, lastUpdateTime, streamStatus])
  
  // For continuous smooth scrolling during active streaming
  useEffect(() => {
    if (!isStreaming || !scrollRef.current || !shouldAutoScroll) return
    
    let rafId: number
    
    const scrollToBottom = () => {
      if (scrollRef.current && shouldAutoScroll) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        rafId = requestAnimationFrame(scrollToBottom)
      }
    }
    
    rafId = requestAnimationFrame(scrollToBottom)
    
    return () => cancelAnimationFrame(rafId)
  }, [isStreaming, shouldAutoScroll])

  const toggleCodeBlock = (index: string) => {
    setShowFullCode(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  if (!content) return null

  return (
    <div className="relative">
      <ScrollArea 
        className="rounded-xl border border-border/40 p-5 bg-gradient-to-br from-accent/5 to-background analysis-container"
        style={{ height: maxHeight }}
        ref={scrollRef}
      >
        <div className="overflow-x-auto w-full">
          <ReactMarkdown 
            className="text-sm prose prose-invert prose-sm max-w-none break-words prose-p:my-1.5 prose-headings:my-2 prose-pre:bg-accent/20 prose-pre:border prose-pre:border-accent/20 prose-pre:rounded-lg"
            components={{
              code({node, className, children, ...props}) {
                const codeContent = String(children).replace(/\n$/, '');
                const codeId = `code-${Math.random().toString(36).substring(2, 9)}`;
                
                // Check if this is an inline code block
                // ReactMarkdown passes a className for non-inline code blocks
                const isInline = !className;
                
                if (isInline) {
                  return (
                    <code 
                      className="bg-accent/20 text-primary-foreground px-1.5 py-0.5 rounded text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  )
                }
                
                const isExpanded = showFullCode[codeId];
                const shouldTruncate = codeContent.split('\n').length > 10 && !isExpanded;
                
                return (
                  <div className="relative group">
                    <div className="absolute -top-1 -right-1 bg-accent/30 px-2 py-0.5 rounded-md text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      <Braces className="h-3.5 w-3.5 inline-block mr-1" />
                      Code
                    </div>
                    <pre 
                      className={`my-4 p-4 bg-accent/20 border border-accent/20 rounded-lg overflow-x-auto text-xs ${shouldTruncate ? 'max-h-40' : ''}`}
                    >
                      <code {...props}>{shouldTruncate ? codeContent.split('\n').slice(0, 10).join('\n') : codeContent}</code>
                    </pre>
                    {shouldTruncate && (
                      <button 
                        onClick={() => toggleCodeBlock(codeId)} 
                        className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t border-accent/20 bg-accent/10 rounded-b-lg -mt-4 relative flex items-center justify-center"
                      >
                        <ChevronsDown className="h-3 w-3 mr-1" />
                        Show more ({codeContent.split('\n').length - 10} more lines)
                      </button>
                    )}
                    {isExpanded && (
                      <button 
                        onClick={() => toggleCodeBlock(codeId)} 
                        className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t border-accent/20 bg-accent/10 rounded-b-lg -mt-4 relative flex items-center justify-center"
                      >
                        <ChevronsDown className="h-3 w-3 mr-1 transform rotate-180" />
                        Show less
                      </button>
                    )}
                  </div>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </ScrollArea>
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/30 shadow-sm">
            <span className="text-xs text-muted-foreground">
              {streamStatus === 'waiting' ? "Waiting for data..." : "Streaming..."}
            </span>
            <div className="flex gap-1">
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-75' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${streamStatus === 'streaming' ? 'bg-primary animate-pulse delay-150' : 'bg-muted-foreground'}`} />
            </div>
          </div>
        </div>
      )}
      
      {!shouldAutoScroll && isStreaming && (
        <button 
          onClick={() => {
            setShouldAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-2 left-2 bg-primary/80 hover:bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 shadow-md border border-primary/30"
        >
          <Database className="h-3 w-3" />
          Resume auto-scroll
        </button>
      )}
    </div>
  )
}
