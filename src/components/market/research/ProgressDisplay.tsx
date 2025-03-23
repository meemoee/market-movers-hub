
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Clock, Loader2, CheckCircle, AlertCircle } from "lucide-react"

interface ProgressDisplayProps {
  messages: string[]
  jobId?: string
  progress?: number
  status?: 'queued' | 'processing' | 'completed' | 'failed' | null
}

export function ProgressDisplay({ messages, jobId, progress, status }: ProgressDisplayProps) {
  const [currentMessage, setCurrentMessage] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  
  // Log new messages for debugging
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      console.log(`[ProgressDisplay] New message (${messages.length}):`, latestMessage);
      setCurrentMessage(latestMessage);
    }
  }, [messages])
  
  // Log status changes
  useEffect(() => {
    console.log(`[ProgressDisplay] Status update:`, { status, progress, jobId });
  }, [status, progress, jobId]);
  
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
  
  const renderStatusIcon = () => {
    if (!status) return null;
    
    switch (status) {
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40" ref={scrollAreaRef}>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
          {jobId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Job ID: {jobId}</span>
                {status && renderStatusIcon()}
                <span>{status === 'completed' 
                  ? 'Complete' 
                  : status === 'failed' 
                  ? 'Failed'
                  : 'Processing in background'}</span>
              </div>
              {progress !== undefined && (
                <Progress 
                  value={progress} 
                  className={cn(
                    "h-2",
                    status === 'completed' ? "bg-green-100" : 
                    status === 'failed' ? "bg-red-100" : ""
                  )} 
                />
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
