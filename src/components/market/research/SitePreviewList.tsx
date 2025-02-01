import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Globe } from "lucide-react"
import { getFaviconUrl } from "@/utils/favicon"

interface SitePreviewListProps {
  results: Array<{
    url: string
    title?: string
  }>
}

export function SitePreviewList({ results }: SitePreviewListProps) {
  if (!results.length) return null;

  return (
    <ScrollArea className="h-[200px] rounded-md border p-4">
      {results.map((result, index) => (
        <div key={index} className="mb-4 last:mb-0 p-3 bg-accent/5 rounded-lg">
          <div className="flex items-center gap-2">
            <img 
              src={getFaviconUrl(result.url)} 
              alt=""
              className="w-4 h-4"
              onError={(e) => {
                e.currentTarget.src = result.title ? 
                  FileText : Globe;
              }}
            />
            <h4 className="text-sm font-medium">
              {result.title || new URL(result.url).hostname}
            </h4>
          </div>
          <a 
            href={result.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline block mt-1"
          >
            {result.url}
          </a>
        </div>
      ))}
    </ScrollArea>
  )
}