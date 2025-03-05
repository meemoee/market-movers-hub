
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoIcon, LightbulbIcon, Target, TrendingUpIcon } from "lucide-react"

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: string;
  } | null;
}

interface InsightsDisplayProps {
  streamingState: StreamingState;
  onResearchArea?: (area: string) => void;
}

export function InsightsDisplay({ streamingState, onResearchArea }: InsightsDisplayProps) {
  if (!streamingState.parsedData) return null;

  const { probability, areasForResearch, reasoning } = streamingState.parsedData;
  
  // Check if market is resolved (100% or 0%)
  const isResolved = probability === "100%" || probability === "0%";

  return (
    <div className="space-y-4">
      {probability && (
        <Card className="p-4 bg-accent/20 border-accent">
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="h-5 w-5 text-primary" />
            <h3 className="text-base font-medium">
              {isResolved ? 'Market Status' : 'Probability Estimate'}
            </h3>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="text-2xl font-bold">{probability}</div>
            <div className="text-sm text-muted-foreground">
              {isResolved ? (probability === "100%" ? 'event occurred' : 'event did not occur') : 'likelihood based on research'}
            </div>
          </div>
          
          {reasoning && (
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center gap-2 mb-1">
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {isResolved ? 'Explanation' : 'Reasoning'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{reasoning}</p>
            </div>
          )}
        </Card>
      )}

      {areasForResearch && areasForResearch.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <LightbulbIcon className="h-5 w-5 text-amber-500" />
            <h3 className="text-base font-medium">Areas for Further Research</h3>
          </div>
          <div className="space-y-3">
            {areasForResearch.map((area, index) => (
              <div key={index} className="flex items-start gap-2">
                <Target className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm">{area}</p>
                  {onResearchArea && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-1 h-7 text-xs text-primary"
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
