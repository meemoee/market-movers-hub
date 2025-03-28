
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search } from "lucide-react"
import { getFaviconUrl } from "@/utils/favicon"
import { ResearchResult } from "../SitePreviewList"

interface SourcesTabContentProps {
  results: ResearchResult[];
}

export function SourcesTabContent({ results }: SourcesTabContentProps) {
  return (
    <ScrollArea className="h-full rounded-md border p-3 w-full max-w-full">
      <div className="space-y-2 w-full">
        {results.map((result, idx) => (
          <div key={idx} className="source-item bg-accent/5 hover:bg-accent/10 w-full max-w-full p-2 rounded-md">
            <div className="flex items-center gap-2">
              <img 
                src={getFaviconUrl(result.url)} 
                alt=""
                className="w-4 h-4 flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
                  )}`;
                }}
              />
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
