
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useLayoutEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Clock, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ProgressDisplayProps {
  messages: string[]
  jobId?: string
  progress?: number
  status?: 'queued' | 'processing' | 'completed' | 'failed' | null
  estimatedTime?: number
}

export function ProgressDisplay({ messages, jobId, progress, status, estimatedTime }: ProgressDisplayProps) {
  const [currentMessage, setCurrentMessage] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(estimatedTime || null)
  
  useEffect(() => {
    if (messages.length > 0) {
      setCurrentMessage(messages[messages.length - 1])
    }
  }, [messages])
  
  // Update time remaining
  useEffect(() => {
    if (status === 'processing' && timeRemaining !== null && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 0) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [status, timeRemaining]);
  
  // Reset time remaining when status changes
  useEffect(() => {
    if (status === 'completed' || status === 'failed') {
      setTimeRemaining(null);
    } else if (status === 'processing' && estimatedTime) {
      setTimeRemaining(estimatedTime);
    }
  }, [status, estimatedTime]);
  
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

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };
  
  return (
    <div className="relative rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40" ref={scrollAreaRef}>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-2">
          {jobId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Job ID: {jobId}</span>
                {status && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "flex items-center gap-1 px-2 py-0 h-5",
                      status === 'queued' && "bg-yellow-50 text-yellow-700 border-yellow-200",
                      status === 'processing' && "bg-blue-50 text-blue-700 border-blue-200",
                      status === 'completed' && "bg-green-50 text-green-700 border-green-200",
                      status === 'failed' && "bg-red-50 text-red-700 border-red-200"
                    )}
                  >
                    {renderStatusIcon()}
                    <span>
                      {status === 'completed' 
                        ? 'Complete' 
                        : status === 'failed' 
                        ? 'Failed'
                        : status === 'queued'
                        ? 'Queued'
                        : 'Processing'}
                    </span>
                  </Badge>
                )}
                {timeRemaining !== null && status === 'processing' && (
                  <span className="text-xs text-muted-foreground">Est. time: {formatTimeRemaining(timeRemaining)}</span>
                )}
              </div>
              {progress !== undefined && (
                <div className="space-y-1">
                  <Progress 
                    value={progress} 
                    className={cn(
                      "h-2",
                      status === 'completed' ? "bg-green-100" : 
                      status === 'failed' ? "bg-red-100" : ""
                    )} 
                  />
                  {progress > 0 && progress < 100 && (
                    <div className="text-xs text-right text-muted-foreground">
                      {progress}%
                    </div>
                  )}
                </div>
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
