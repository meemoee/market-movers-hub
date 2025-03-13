
import { ScrollArea } from "@/components/ui/scroll-area"

interface ProgressDisplayProps {
  messages: string[]
}

export function ProgressDisplay({ messages }: ProgressDisplayProps) {
  if (messages.length === 0) return null;
  
  return (
    <div className="border rounded-md p-3 bg-background/50">
      <ScrollArea className="h-[200px]">
        <div className="space-y-1 text-sm font-mono">
          {messages.map((message, index) => (
            <div key={index} className="flex items-start">
              <span className="text-muted-foreground select-none mr-2">&gt;</span>
              <span>{message}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
