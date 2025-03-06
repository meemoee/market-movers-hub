
import { ExternalLink } from "lucide-react"

interface SourceItemProps {
  url: string
  title?: string
}

export function SourceItem({ url, title }: SourceItemProps) {
  const displayTitle = title || url
  const displayUrl = new URL(url).hostname
  
  return (
    <div className="p-2 rounded-md border border-border/50 bg-background/50 flex flex-col w-full">
      <div className="flex items-start gap-2 w-full">
        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="text-sm font-medium truncate" title={displayTitle}>
            {displayTitle}
          </h3>
          <p className="text-xs text-muted-foreground truncate" title={url}>
            {displayUrl}
          </p>
        </div>
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex-shrink-0 text-primary hover:text-primary/80 transition-colors"
          aria-label="Open link"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}
