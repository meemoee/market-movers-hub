
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoIcon, LightbulbIcon, Target, TrendingUpIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: string;
  } | null;
}

interface InsightsDisplayProps {
  streamingState?: StreamingState;
  probability?: string;
  areasForResearch?: string[];
  reasoning?: string;
  onResearchArea?: (area: string) => void;
}

export function InsightsDisplay({ 
  streamingState, 
  probability: directProbability,
  areasForResearch: directAreasForResearch,
  reasoning: directReasoning,
  onResearchArea 
}: InsightsDisplayProps) {
  // Use either direct props or streaming state
  const probability = directProbability || streamingState?.parsedData?.probability;
  const areasForResearch = directAreasForResearch || streamingState?.parsedData?.areasForResearch;
  const reasoning = directReasoning || streamingState?.parsedData?.reasoning;
  
  // Return loading state or null if no data yet
  if (!probability && !areasForResearch?.length) {
    return null;
  }
  
  // More comprehensive check for error messages in probability
  const hasErrorInProbability = 
    !probability || 
    probability.toLowerCase().includes('error') || 
    probability.toLowerCase().includes('unknown') ||
    probability.toLowerCase().includes('parsing') ||
    probability.toLowerCase().includes('could not') ||
    probability.toLowerCase().includes('unable to') ||
    probability === "null" ||
    probability === "undefined";
  
  // Check if market is resolved (100% or 0%)
  const isResolved = probability === "100%" || probability === "0%";

  // Don't show the probability card if there's an error in probability
  const showProbabilityCard = probability && !hasErrorInProbability;
  
  // Check if we have raw text content (for streaming state)
  const hasMinimumContent = !streamingState || streamingState.rawText.length >= 10;
  
  // Don't show the component if we have barely any content and no valid data
  if (!hasMinimumContent && hasErrorInProbability && (!areasForResearch || areasForResearch.length === 0)) {
    return null;
  }
  
  return (
    <div className="space-y-5">
      {showProbabilityCard && (
        <Card className="p-5 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-accent/10 to-background border-accent/30 rounded-xl">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-full">
              <TrendingUpIcon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-base font-semibold">
              {isResolved ? 'Market Status' : 'Probability Estimate'}
            </h3>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-3xl font-bold bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent">
              {probability}
            </div>
            <div className="text-sm text-muted-foreground">
              {isResolved 
                ? (probability === "100%" ? 'event occurred' : 'event did not occur') 
                : 'likelihood based on research'}
            </div>
          </div>
          
          {reasoning && (
            <div className="mt-4 border-t pt-4 border-accent/20">
              <div className="flex items-center gap-2 mb-2">
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {isResolved ? 'Explanation' : 'Reasoning'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{reasoning}</p>
            </div>
          )}
        </Card>
      )}

      {areasForResearch && areasForResearch.length > 0 && (
        <Card className="p-5 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-accent/5 to-background border-accent/20 rounded-xl">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-500/10 p-2 rounded-full">
              <LightbulbIcon className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-base font-semibold">Areas for Further Research</h3>
          </div>
          <div className="space-y-4">
            {areasForResearch.map((area, index) => (
              <div key={index} className="flex gap-3 group p-2 rounded-lg transition-colors hover:bg-accent/10">
                <Target className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm leading-relaxed">{area}</p>
                  {onResearchArea && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 h-8 text-xs text-primary hover:bg-primary/10 transition-colors group-hover:bg-primary/5"
                      onClick={() => onResearchArea(area)}
                    >
                      Research this area
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
