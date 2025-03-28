
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search } from "lucide-react"

interface QueriesTabContentProps {
  queries: string[];
}

export function QueriesTabContent({ queries }: QueriesTabContentProps) {
  return (
    <ScrollArea className="h-full rounded-md border p-3 w-full">
      <div className="space-y-2 w-full">
        {queries.map((query, idx) => (
          <div key={idx} className="query-badge bg-accent/10 p-2 rounded-md flex items-center gap-1 w-full mb-2">
            <Search className="h-3 w-3 flex-shrink-0 mr-1" />
            <span className="text-xs break-words">{query}</span>
          </div>
        ))}
        
        {queries.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            No queries for this iteration.
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
