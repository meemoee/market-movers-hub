
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ProgressDisplayProps {
  messages: string[]
  currentIteration?: number
  maxIterations?: number
  currentQueryIndex?: number
  queries?: string[]
  isLoading?: boolean
  currentProgress?: number
  currentQuery?: string | null
}

export function ProgressDisplay({ 
  messages, 
  currentIteration, 
  maxIterations, 
  currentQueryIndex, 
  queries,
  isLoading,
  currentProgress,
  currentQuery
}: ProgressDisplayProps) {
  const [currentMessage, setCurrentMessage] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (messages && messages.length > 0) {
      setCurrentMessage(messages[messages.length - 1])
    }
  }, [messages])
  
  // Use useLayoutEffect to ensure scroll happens before browser paint
  useLayoutEffect(() => {
    // Only scroll within the component itself
    if (messagesEndRef.current && scrollAreaRef.current) {
      // Using direct DOM manipulation for container-confined scrolling
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  if (!messages || !messages.length) return null
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40" ref={scrollAreaRef}>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
          {messages.map((message, index) => (
            <div 
              key={`${index}-${message?.substring?.(0, 20) || index}`}
              className={cn(
                "flex items-center gap-3 py-1 text-sm",
                index === messages.length - 1 ? "animate-pulse" : ""
              )}
            >
              {index === messages.length - 1 && (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              <span className={index === messages.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                {message || ""}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
          
          {isLoading && currentQueryIndex !== undefined && currentQueryIndex >= 0 && queries && queries.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-1">Current search queries:</div>
              <div className="space-y-1">
                {queries.map((query, index) => (
                  <div 
                    key={`query-${index}`}
                    className={cn(
                      "text-xs px-2 py-1 rounded",
                      index === currentQueryIndex ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    )}
                  >
                    {index + 1}. {query && (query.length > 80 ? `${query.substring(0, 80)}...` : query)}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {currentProgress !== undefined && currentProgress > 0 && (
            <div className="mt-2 pt-2 border-t">
              <div className="w-full bg-accent/20 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${Math.min(currentProgress * 100, 100)}%` }}
                />
              </div>
              {currentQuery && (
                <div className="text-xs text-muted-foreground mt-1 italic">
                  Current search: {currentQuery.length > 60 ? `${currentQuery.substring(0, 60)}...` : currentQuery}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
