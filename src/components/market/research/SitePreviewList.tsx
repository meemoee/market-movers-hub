
import { Card } from "@/components/ui/card"
import { format } from "date-fns"
import { ResearchResult } from "./types"

interface SitePreviewListProps {
  results: ResearchResult[]
  compact?: boolean
}

export function SitePreviewList({ results, compact = false }: SitePreviewListProps) {
  if (!results.length) {
    return null
  }

  if (compact) {
    return (
      <div className="text-sm">
        <ul className="list-disc pl-5 space-y-1">
          {results.map((result, index) => (
            <li key={index}>
              <a 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {result.title || "Unnamed source"}
              </a>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {results.map((result, index) => (
        <Card key={index} className="p-3 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {result.favicon && (
                <img 
                  src={result.favicon} 
                  alt="" 
                  className="w-4 h-4" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
              <a 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline line-clamp-1"
              >
                {result.title || "Unnamed source"}
              </a>
            </div>
            
            {result.source && (
              <div className="text-muted-foreground text-xs flex items-center gap-2">
                <span>{result.source}</span>
                {result.date && (
                  <>
                    <span>•</span>
                    <span>{format(new Date(result.date), 'MMM d, yyyy')}</span>
                  </>
                )}
              </div>
            )}
            
            {result.snippet && (
              <p className="line-clamp-2 text-muted-foreground">
                {result.snippet}
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
