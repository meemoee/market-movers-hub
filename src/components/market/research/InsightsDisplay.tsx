
import { ScrollArea } from "@/components/ui/scroll-area"
import { Target, ArrowDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

interface InsightsDisplayProps {
  streamingState: {
    rawText: string
    parsedData: {
      probability: string
      areasForResearch: string[]
    } | null
  }
  onResearchArea?: (area: string) => void
}

export function InsightsDisplay({ streamingState, onResearchArea }: InsightsDisplayProps) {
  const getProbabilityColor = (probability: string) => {
    const numericProb = parseInt(probability.replace('%', ''))
    return numericProb >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'
  }

  if (!streamingState.rawText) return null;

  if (!streamingState.parsedData) {
    return (
      <div className="space-y-4 bg-accent/5 rounded-md p-4">
        <div className="text-sm text-muted-foreground animate-pulse">
          Analyzing insights...
        </div>
        <pre className="text-xs overflow-x-auto">
          {streamingState.rawText}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-accent/5 rounded-md p-4">
      <div className={`space-y-4 p-3 rounded-lg ${getProbabilityColor(streamingState.parsedData.probability)}`}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Probability: {streamingState.parsedData.probability}
          </span>
        </div>
        
        {Array.isArray(streamingState.parsedData.areasForResearch) && 
         streamingState.parsedData.areasForResearch.length > 0 && (
          <>
            <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
            <div>
              <div className="text-sm font-medium mb-2">Areas Needing Research:</div>
              <ul className="space-y-1">
                {streamingState.parsedData.areasForResearch.map((area, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    {onResearchArea ? (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-auto py-1 px-2 justify-start text-left font-normal hover:bg-primary/10 w-full"
                        onClick={() => onResearchArea(area)}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <ArrowDown className="h-3 w-3 flex-shrink-0" />
                          <span>{area}</span>
                          <Search className="h-3 w-3 ml-auto text-muted-foreground" />
                        </div>
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ArrowDown className="h-3 w-3" />
                        {area}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-center pt-2">
        <ArrowDown className="h-5 w-5 text-muted-foreground animate-bounce" />
      </div>
    </div>
  )
}
