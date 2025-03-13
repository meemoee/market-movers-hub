
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"

interface ProgressDisplayProps {
  messages: string[]
  jobId?: string
  jobStatus?: 'processing' | 'completed' | 'failed'
  progress?: number
}

export function ProgressDisplay({ messages, jobId, jobStatus, progress = 0 }: ProgressDisplayProps) {
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

  if (!messages.length && !jobId) return null
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40" ref={scrollAreaRef}>
      {jobId && (
        <div className="absolute top-0 left-0 right-0 px-4 py-2 bg-muted/50 border-b flex items-center justify-between">
          <div className="text-xs font-medium">
            Job ID: {jobId.substring(0, 8)}...
          </div>
          <div className="text-xs font-medium">
            Status: <span className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium",
              jobStatus === 'completed' ? "bg-green-500/20 text-green-500" :
              jobStatus === 'failed' ? "bg-red-500/20 text-red-500" :
              "bg-blue-500/20 text-blue-500"
            )}>
              {jobStatus || 'processing'}
            </span>
          </div>
        </div>
      )}

      <ScrollArea className={cn("h-full", jobId ? "pt-10" : "")}>
        <div className="p-4 space-y-2">
          {jobId && progress > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5 w-full" />
            </div>
          )}

          {messages.map((message, index) => (
            <div 
              key={`${index}-${message.substring(0, 20)}`}
              className={cn(
                "flex items-center gap-3 py-1 text-sm",
                index === messages.length - 1 ? "animate-pulse" : ""
              )}
            >
              {index === messages.length - 1 && (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              <span className={index === messages.length - 1 ? "text-foreground" : "text-muted-foreground"}>
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
