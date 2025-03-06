
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Terminal, AlertCircle, Info, CheckCircle2 } from "lucide-react"

interface ProgressDisplayProps {
  messages: string[]
}

export function ProgressDisplay({ messages }: ProgressDisplayProps) {
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
    if (messagesEndRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  if (!messages.length) return null
  
  const getMessageIcon = (message: string) => {
    if (message.toLowerCase().includes('error')) {
      return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
    } else if (message.toLowerCase().includes('complete')) {
      return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
    } else if (message.toLowerCase().includes('searching') || message.toLowerCase().includes('query')) {
      return <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
    }
    return <Terminal className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  }
  
  return (
    <div 
      className="relative rounded-xl border bg-gradient-to-b from-background to-accent/5 text-card-foreground shadow-md overflow-hidden h-40" 
      ref={scrollAreaRef}
    >
      <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
          {messages.map((message, index) => (
            <div 
              key={`${index}-${message.substring(0, 20)}`}
              className={cn(
                "flex items-start gap-3 py-1.5 px-2 rounded-lg text-sm",
                index === messages.length - 1 ? 
                  "animate-pulse bg-primary/5 border border-primary/20" : 
                  "text-muted-foreground hover:bg-accent/5 transition-colors"
              )}
            >
              {index === messages.length - 1 && (
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              {getMessageIcon(message)}
              <span className={index === messages.length - 1 ? "text-foreground" : ""}>
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
