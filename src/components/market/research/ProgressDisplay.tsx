
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"

interface ProgressDisplayProps {
  messages: string[]
  jobId?: string
  progress?: number
}

export function ProgressDisplay({ messages, jobId, progress }: ProgressDisplayProps) {
  const [currentMessage, setCurrentMessage] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (messages.length > 0) {
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

  if (!messages.length) return null
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40" ref={scrollAreaRef}>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
          {jobId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Job ID: {jobId}</span>
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span>Processing in background</span>
              </div>
              {progress !== undefined && (
                <Progress value={progress} className="h-2" />
              )}
            </div>
          )}
          
          {messages.map((message, index) => (
            <div 
              key={`${index}-${message.substring(0, 20)}`}
              className={cn(
                "flex items-center gap-3 py-1 text-sm",
                index === messages.length - 1 && !jobId ? "animate-pulse" : ""
              )}
            >
              {index === messages.length - 1 && !jobId && (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              <span className={index === messages.length - 1 && !jobId ? "text-foreground" : "text-muted-foreground"}>
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
