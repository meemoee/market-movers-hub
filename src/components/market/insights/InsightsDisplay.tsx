
import { Target, ArrowDown, Search } from "lucide-react"

interface InsightsDisplayProps {
  probability: string;
  areasForResearch: string[];
}

export function InsightsDisplay({ probability, areasForResearch }: InsightsDisplayProps) {
  const getProbabilityColor = (probability: string) => {
    const numericProb = parseInt(probability.replace('%', ''))
    return numericProb >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'
  }

  return (
    <div className="space-y-4 bg-accent/5 rounded-md p-4">
      <div className={`space-y-4 p-3 rounded-lg ${getProbabilityColor(probability)}`}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Probability: {probability}
          </span>
        </div>
        
        {Array.isArray(areasForResearch) && 
         areasForResearch.length > 0 && (
          <>
            <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
            <div>
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <Search className="h-3 w-3 text-primary" />
                <span>Areas Needing Further Research:</span>
              </div>
              <ul className="space-y-2">
                {areasForResearch.map((area, index) => (
                  <li key={index} className="text-sm text-muted-foreground flex items-start gap-2 p-2 rounded-md bg-black/5 dark:bg-white/5">
                    <ArrowDown className="h-3 w-3 mt-1 flex-shrink-0" />
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
