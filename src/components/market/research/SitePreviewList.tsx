
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Globe } from "lucide-react"
import { getFaviconUrl } from "@/utils/favicon"

export interface ResearchResult {
  url: string;
  title?: string;
  content?: string;
}

interface SitePreviewListProps {
  results: ResearchResult[]
}

export function SitePreviewList({ results }: SitePreviewListProps) {
  if (!results.length) return null;

  return (
    <ScrollArea className="h-[200px] rounded-md border p-4 w-full max-w-full" orientation="vertical" scrollHideDelay={100}>
      <div className="mb-2 text-sm text-muted-foreground">
        {results.length} {results.length === 1 ? 'source' : 'sources'} collected
      </div>
      <div className="w-full">
        {results.map((result, index) => (
          <div key={index} className="mb-4 last:mb-0 p-3 bg-accent/5 rounded-lg w-full overflow-hidden">
            <div className="flex items-center gap-2 w-full">
              <img 
                src={getFaviconUrl(result.url)} 
                alt=""
                className="w-4 h-4 flex-shrink-0"
                onError={(e) => {
                  const IconComponent = result.title ? FileText : Globe;
                  const svgString = `data:image/svg+xml,${encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
                      result.title 
                        ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>'
                        : '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>'
                    }</svg>`
                  )}`;
                  e.currentTarget.src = svgString;
                }}
              />
              <h4 className="text-sm font-medium truncate max-w-[calc(100%-1.5rem)]">
                {result.title || new URL(result.url).hostname}
              </h4>
            </div>
            <a 
              href={result.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline block mt-1 truncate w-full"
              title={result.url}
            >
              {result.url}
            </a>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
