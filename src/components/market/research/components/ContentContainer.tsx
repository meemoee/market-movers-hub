
import { ScrollArea } from "@/components/ui/scroll-area"
import { ReactNode } from "react"

interface ContentContainerProps {
  children: ReactNode;
  maxHeight?: string | number;
  className?: string;
}

export function ContentContainer({ children, maxHeight = "200px", className }: ContentContainerProps) {
  return (
    <ScrollArea 
      className={`rounded-md border p-4 bg-accent/5 max-w-full overflow-hidden ${className || ''}`}
      style={{ height: maxHeight }}
    >
      <div className="min-w-0 max-w-full overflow-hidden">
        {children}
      </div>
    </ScrollArea>
  )
}
