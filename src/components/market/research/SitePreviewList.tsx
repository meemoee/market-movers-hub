
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Globe, ExternalLink } from "lucide-react"
import { getFaviconUrl } from "@/utils/favicon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface SitePreviewListProps {
  results: Array<{
    url: string
    title?: string
    content?: string
  }>
}

export function SitePreviewList({ results }: SitePreviewListProps) {
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  
  if (!results.length) return null;

  return (
    <ScrollArea className="h-[250px] rounded-xl border p-4 content-wrapper">
      <div className="mb-2 text-sm text-muted-foreground flex items-center">
        <Badge variant="outline" className="mr-2">
          {results.length} {results.length === 1 ? 'source' : 'sources'}
        </Badge>
        <span className="text-xs">Select a source to view content preview</span>
      </div>
      <div className="grid gap-3">
        {results.map((result, index) => (
          <div 
            key={index} 
            className={`source-card ${expandedItem === index ? 'ring-1 ring-brand/40 bg-brand/5' : ''}`}
          >
            <div className="flex items-center gap-2">
              <img 
                src={getFaviconUrl(result.url)} 
                alt=""
                className="w-5 h-5 rounded-full bg-background p-0.5 flex-shrink-0"
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
              <div className="flex-1 min-w-0 overflow-hidden">
                <h4 className="text-sm font-medium truncate">
                  {result.title || new URL(result.url).hostname}
                </h4>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-muted-foreground truncate-url">
                    {new URL(result.url).hostname}
                  </span>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 flex-shrink-0"
                onClick={() => setExpandedItem(expandedItem === index ? null : index)}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                {expandedItem === index ? "Hide" : "View"}
              </Button>
            </div>
            
            {expandedItem === index && result.content && (
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                <div className="max-h-20 overflow-y-auto content-wrapper">
                  {result.content.substring(0, 300)}
                  {result.content.length > 300 && "..."}
                </div>
                <a 
                  href={result.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open source in new tab
                </a>
              </div>
            )}
            
            {expandedItem !== index && (
              <a 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary/80 hover:text-primary hover:underline block mt-1 truncate-url"
              >
                {result.url}
              </a>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
