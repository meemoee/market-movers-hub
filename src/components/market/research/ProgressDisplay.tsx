import { ScrollArea } from "@/components/ui/scroll-area"

interface ProgressDisplayProps {
  messages: string[]
}

export function ProgressDisplay({ messages }: ProgressDisplayProps) {
  if (!messages.length) return null;
  
  return (
    <ScrollArea className="h-[100px] rounded-md border p-4">
      {messages.map((message, index) => (
        <div key={index} className="text-sm text-muted-foreground">
          {message}
        </div>
      ))}
    </ScrollArea>
  )
}