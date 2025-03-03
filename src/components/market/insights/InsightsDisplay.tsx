
import { Target, ArrowDown, AlertCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface InsightsDisplayProps {
  probability: string;
  areasForResearch: string[];
  title?: string;
  analysis?: string;
  isLoading?: boolean;
}

export function InsightsDisplay({ probability, areasForResearch, title, analysis, isLoading }: InsightsDisplayProps) {
  const getProbabilityColor = (probability: string) => {
    const numericProb = parseInt(probability.replace('%', ''))
    return numericProb >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'
  }

  return (
    <div className="space-y-4 bg-accent/5 rounded-md p-4 overflow-hidden">
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">{title}</span>
          {isLoading && <span className="text-xs text-muted-foreground animate-pulse">Evaluating...</span>}
        </div>
      )}
      
      <div className={`space-y-4 p-3 rounded-lg ${getProbabilityColor(probability)}`}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Probability: {probability}
          </span>
        </div>
        
        {analysis && (
          <>
            <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
            <div className="text-sm text-muted-foreground">
              {analysis}
            </div>
          </>
        )}
        
        {Array.isArray(areasForResearch) && 
         areasForResearch.length > 0 && (
          <>
            <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
            <div>
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Areas Needing Research:
              </div>
              <ScrollArea className="max-h-[200px]">
                <ul className="space-y-1">
                  {areasForResearch.map((area, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                      <ArrowDown className="h-3 w-3 text-amber-500" />
                      {area}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
