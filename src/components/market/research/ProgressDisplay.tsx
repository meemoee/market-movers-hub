import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

interface ProgressDisplayProps {
  messages: string[]
}

export function ProgressDisplay({ messages }: ProgressDisplayProps) {
  const [currentMessage, setCurrentMessage] = useState<string>("")
  
  useEffect(() => {
    if (messages.length > 0) {
      setCurrentMessage(messages[messages.length - 1])
    }
  }, [messages])

  if (!messages.length) return null
  
  return (
    <div className="relative h-16 rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div 
        key={currentMessage} 
        className={cn(
          "absolute inset-0 p-4 flex items-center justify-center text-sm",
          "animate-in slide-in-from-bottom duration-300",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-muted-foreground">
            {currentMessage}
          </span>
        </div>
      </div>
    </div>
  )
}