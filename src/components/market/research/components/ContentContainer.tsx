
import { ScrollArea } from "@/components/ui/scroll-area"
import { ReactNode, forwardRef } from "react"

interface ContentContainerProps {
  children: ReactNode;
  maxHeight?: string | number;
  className?: string;
}

export const ContentContainer = forwardRef<HTMLDivElement, ContentContainerProps>(
  ({ children, maxHeight = "200px", className }, ref) => {
    return (
      <ScrollArea 
        ref={ref}
        className={`rounded-md border p-4 bg-accent/5 max-w-full overflow-hidden ${className || ''}`}
        style={{ height: maxHeight }}
      >
        <div className="min-w-0 max-w-full overflow-hidden">
          {children}
        </div>
      </ScrollArea>
    )
  }
)

ContentContainer.displayName = 'ContentContainer'
