
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ProgressDisplayProps {
  messages: string[]
}

export function ProgressDisplay({ messages }: ProgressDisplayProps) {
  const [currentMessage, setCurrentMessage] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (messages.length > 0) {
      setCurrentMessage(messages[messages.length - 1])
    }
  }, [messages])
  
  useEffect(() => {
    // Auto-scroll to the bottom within the ScrollArea component only
    // Using requestAnimationFrame to ensure DOM is ready and limiting scroll to the component
    if (messagesEndRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'end',
          inline: 'nearest'
        });
      });
    }
  }, [messages]);

  if (!messages.length) return null
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
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
