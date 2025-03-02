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
    // Auto-scroll to the bottom when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Filter out "Query X:" messages that are just repeating the description
  const filteredMessages = messages.filter(message => {
    // Keep non-query messages
    if (!message.includes('Query ') || !message.includes(': "')) {
      return true;
    }
    
    // Filter out queries that are just repetitions of description snippets
    const queryText = message.split(': "')[1]?.replace('"', '') || '';
    return !queryText.startsWith('This market will resolve');
  });

  if (!filteredMessages.length) return null;
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
      <ScrollArea className="h-44">
        <div className="p-4 space-y-2">
          {filteredMessages.map((message, index) => (
            <div 
              key={`${index}-${message.substring(0, 20)}`}
              className={cn(
                "flex items-center gap-3 py-1 text-sm",
                index === filteredMessages.length - 1 ? "animate-pulse" : ""
              )}
            >
              {index === filteredMessages.length - 1 && (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              <span className={index === filteredMessages.length - 1 ? "text-foreground" : "text-muted-foreground"}>
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
