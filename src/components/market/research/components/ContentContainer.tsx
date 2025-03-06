
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
        className={`rounded-md border p-4 bg-accent/5 w-full overflow-hidden ${className || ''}`}
        style={{ maxHeight, height: maxHeight }}
      >
        <div className="w-full max-w-full break-words overflow-hidden">
          {children}
        </div>
      </ScrollArea>
    )
  }
)

ContentContainer.displayName = 'ContentContainer'
