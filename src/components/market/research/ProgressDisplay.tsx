
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface ProgressDisplayProps {
  messages: string[]
  progress?: string[] // Add for backwards compatibility
}

export function ProgressDisplay({ messages, progress }: ProgressDisplayProps) {
  // Use progress as fallback if provided (for backwards compatibility)
  const displayMessages = messages || progress || [];
  const [currentMessage, setCurrentMessage] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (displayMessages.length > 0) {
      setCurrentMessage(displayMessages[displayMessages.length - 1])
    }
  }, [displayMessages])
  
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
  }, [displayMessages]);

  if (!displayMessages.length) return null
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40" ref={scrollAreaRef}>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
          {displayMessages.map((message, index) => (
            <div 
              key={`${index}-${message.substring(0, 20)}`}
              className={cn(
                "flex items-center gap-3 py-1 text-sm",
                index === displayMessages.length - 1 ? "animate-pulse" : ""
              )}
            >
              {index === displayMessages.length - 1 && (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              <span className={index === displayMessages.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                {message}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    </div>
  )
}
