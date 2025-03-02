
import { ScrollArea } from "@/components/ui/scroll-area"

interface SitePreviewListProps {
  results: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
}

export function SitePreviewList({ results }: SitePreviewListProps) {
  if (!results || results.length === 0) return null

  return (
    <ScrollArea className="h-[200px] rounded-md border max-w-full">
      <div className="p-4 space-y-3 overflow-hidden">
        {results.map((result, index) => (
          <div key={index} className="text-sm hover:bg-accent/20 p-2 rounded overflow-hidden">
            <a 
              href={result.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline truncate block max-w-full"
            >
              {result.title || result.url}
            </a>
            <p className="mt-1 line-clamp-2 text-muted-foreground break-words">
              {result.content?.substring(0, 150)}...
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
