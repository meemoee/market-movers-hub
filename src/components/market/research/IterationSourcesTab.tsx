
import { ScrollArea } from "@/components/ui/scroll-area"
import { FaviconDisplay } from "./FaviconDisplay"
import { ResearchResult } from "./SitePreviewList"

interface IterationSourcesTabProps {
  results: ResearchResult[];
}

export function IterationSourcesTab({ results }: IterationSourcesTabProps) {
  return (
    <ScrollArea className="h-full rounded-md border p-3 w-full max-w-full">
      <div className="space-y-2 w-full">
        {results.map((result, idx) => (
          <div key={idx} className="source-item bg-accent/5 hover:bg-accent/10 w-full max-w-full p-2 rounded-md">
            <div className="flex items-center gap-2">
              <FaviconDisplay url={result.url} title={result.title} />
              <a 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline truncate w-full"
                title={result.url}
              >
                {result.url}
              </a>
            </div>
          </div>
        ))}
        
        {results.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            No sources found for this iteration.
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
