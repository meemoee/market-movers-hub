
import { Target, ArrowDown, AlertCircle, Info } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface InsightsDisplayProps {
  probability: string;
  areasForResearch: string[];
  reasoning?: string;
  onResearchArea?: (area: string) => void;
}

export function InsightsDisplay({ probability, areasForResearch, reasoning, onResearchArea }: InsightsDisplayProps) {
  const getProbabilityColor = (probability: string) => {
    const numericProb = parseInt(probability.replace('%', ''))
    return numericProb >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'
  }

  return (
    <div className="space-y-4 bg-accent/5 rounded-md p-4 overflow-hidden">
      <div className={`space-y-4 p-3 rounded-lg ${getProbabilityColor(probability)}`}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Probability: {probability}
          </span>
        </div>
        
        {reasoning && (
          <div className="mt-2">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Info className="h-4 w-4 text-primary" />
              Reasoning:
            </div>
            <p className="text-sm text-muted-foreground">{reasoning}</p>
          </div>
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
                      {onResearchArea && (
                        <button 
                          onClick={() => onResearchArea(area)}
                          className="text-xs text-primary hover:underline ml-2"
                        >
                          Research
                        </button>
                      )}
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
