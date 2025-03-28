
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface IterationCardHeaderProps {
  iteration: number;
  resultsCount: number;
  isStreaming: boolean;
  isCurrentIteration: boolean;
  isExpanded: boolean;
  isFinalIteration: boolean;
  onToggleExpand: () => void;
}

export function IterationCardHeader({
  iteration,
  resultsCount,
  isStreaming,
  isCurrentIteration,
  isExpanded,
  isFinalIteration,
  onToggleExpand
}: IterationCardHeaderProps) {
  return (
    <div 
      className={cn(
        "iteration-card-header flex items-center justify-between p-3 w-full",
        isExpanded ? "bg-accent/10" : "",
        "hover:bg-accent/10 cursor-pointer"
      )}
      onClick={onToggleExpand}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <Badge variant={isFinalIteration ? "default" : "outline"} 
          className={isStreaming && isCurrentIteration ? "animate-pulse bg-primary" : ""}>
          Iteration {iteration}
          {isStreaming && isCurrentIteration && " (Streaming...)"}
        </Badge>
        <span className="text-sm truncate">
          {isFinalIteration ? "Final Analysis" : `${resultsCount} sources found`}
        </span>
      </div>
      {isExpanded ? 
        <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : 
        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      }
    </div>
  );
}
