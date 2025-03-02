
import { useEffect, useRef } from "react"
import { ResearchResult } from "../WebResearchCard"
import { Badge } from "@/components/ui/badge"
import { Link } from "lucide-react"

interface SitePreviewListProps {
  results: ResearchResult[]
  onSelectResult?: (result: ResearchResult) => void
  selectedIndex?: number
  className?: string
}

export function SitePreviewList({ 
  results, 
  onSelectResult,
  selectedIndex = -1,
  className = ""
}: SitePreviewListProps) {
  const selectedRef = useRef<HTMLDivElement>(null)

  // Scroll into view when selectedIndex changes
  useEffect(() => {
    if (selectedIndex >= 0 && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedIndex])

  if (!results.length) return null

  return (
    <div className={`space-y-3 ${className}`}>
      {results.map((result, index) => (
        <div 
          key={index}
          ref={index === selectedIndex ? selectedRef : null}
          className={`p-3 rounded-md border relative transition-colors ${
            index === selectedIndex ? 'bg-accent/40 border-accent' : 'hover:bg-accent/10 border-transparent'
          } ${onSelectResult ? 'cursor-pointer' : ''}`}
          onClick={() => onSelectResult?.(result)}
        >
          <div className="flex items-start gap-2">
            <Link className="w-5 h-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div className="space-y-1 w-full overflow-hidden">
              <h4 className="font-medium text-sm line-clamp-1">
                {result.title || result.url.split('/').slice(-1)[0]}
              </h4>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-xs bg-primary/10">
                  {new URL(result.url).hostname}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {result.snippet || "No preview available"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
