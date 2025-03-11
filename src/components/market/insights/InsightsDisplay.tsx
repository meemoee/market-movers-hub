
import { Target, ArrowDown, AlertCircle, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ParentResearch {
  id: string;
  focusText?: string;
  onView: () => void;
}

interface ChildResearch {
  id: string;
  focusText: string;
  onView: () => void;
}

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: string;
  } | null;
}

interface InsightsDisplayProps {
  probability?: string;
  areasForResearch?: string[];
  streamingState?: StreamingState;
  onResearchArea?: (area: string) => void;
  parentResearch?: ParentResearch;
  childResearches?: ChildResearch[];
}

export function InsightsDisplay({ 
  probability, 
  areasForResearch, 
  streamingState,
  onResearchArea,
  parentResearch,
  childResearches
}: InsightsDisplayProps) {
  const getProbabilityColor = (prob: string) => {
    const numericProb = parseInt(prob.replace('%', ''))
    return numericProb >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'
  }

  // Use either direct props or streaming state
  const displayProbability = probability || streamingState?.parsedData?.probability || "Unknown";
  const displayAreas = areasForResearch || streamingState?.parsedData?.areasForResearch || [];

  return (
    <div className="space-y-4 bg-accent/5 rounded-md p-4 overflow-hidden">
      <div className={`space-y-4 p-3 rounded-lg ${getProbabilityColor(displayProbability)}`}>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Probability: {displayProbability}
          </span>
        </div>
        
        {Array.isArray(displayAreas) && 
         displayAreas.length > 0 && (
          <>
            <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
            <div>
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Areas Needing Research:
              </div>
              <ScrollArea className="max-h-[200px]">
                <ul className="space-y-1">
                  {displayAreas.map((area, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-center gap-2 group">
                      <ArrowDown className="h-3 w-3 text-amber-500" />
                      <div className="flex-1">{area}</div>
                      {onResearchArea && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                          onClick={() => onResearchArea(area)}
                        >
                          Research
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
            
            {childResearches && childResearches.length > 0 && (
              <>
                <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <ExternalLink className="h-4 w-4 text-blue-500" />
                    Related Research:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {childResearches.map((research) => (
                      <Badge 
                        key={research.id} 
                        variant="secondary" 
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={research.onView}
                      >
                        {research.focusText}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            {parentResearch && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span>Part of broader research: </span>
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-xs"
                  onClick={parentResearch.onView}
                >
                  {parentResearch.focusText || "View parent research"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
