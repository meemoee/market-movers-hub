
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoIcon, LightbulbIcon, Target, TrendingUpIcon, ArrowRightCircle, ArrowLeftIcon, GitBranch, ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: string;
  } | null;
}

interface ResearchChild {
  id: string;
  focusText: string;
  onView: () => void;
}

interface InsightsDisplayProps {
  streamingState: StreamingState;
  onResearchArea?: (area: string) => void;
  parentResearch?: {
    id: string;
    focusText?: string;
    onView?: () => void;
  };
  childResearches?: ResearchChild[];
}

export function InsightsDisplay({ 
  streamingState, 
  onResearchArea, 
  parentResearch,
  childResearches 
}: InsightsDisplayProps) {
  // Return loading state or null if no parsed data yet
  if (!streamingState.parsedData) return null;

  const { probability, areasForResearch, reasoning } = streamingState.parsedData;
  
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

  // Don't show the component if there's an error in probability and no valid research areas
  if ((hasErrorInProbability && (!areasForResearch || areasForResearch.length === 0)) || 
      streamingState.rawText.length < 10) {  // Also don't show if we have barely any raw text (still streaming)
    return null;
  }

  // If there's an error in the probability but we have research areas, only show those
  const showProbabilityCard = probability && !hasErrorInProbability;
  
  // Helper function to find a child research that matches a specific research area
  const findMatchingChildResearch = (area: string): ResearchChild | undefined => {
    if (!childResearches) return undefined;
    return childResearches.find(child => 
      child.focusText.toLowerCase() === area.toLowerCase() ||
      area.toLowerCase().includes(child.focusText.toLowerCase()) ||
      child.focusText.toLowerCase().includes(area.toLowerCase())
    );
  };
  
  return (
    <div className="space-y-5">
      {parentResearch && (
        <Card className="p-4 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-blue-500/10 to-background border-blue-500/30 rounded-xl glow-effect">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"></div>
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-full">
              <ArrowLeftIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">Focused Research</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This is a focused deep-dive from a parent research
              </p>
            </div>
            {parentResearch.onView && (
              <Button 
                onClick={parentResearch.onView}
                variant="outline" 
                size="sm"
                className="ml-auto hover-scale"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                View Parent Research
              </Button>
            )}
          </div>
          {parentResearch.focusText && (
            <div className="mt-3 bg-accent/20 p-3 rounded-lg border border-accent/20">
              <div className="text-sm font-medium mb-1">Research Focus:</div>
              <div className="text-sm">{parentResearch.focusText}</div>
            </div>
          )}
        </Card>
      )}

      {showProbabilityCard && (
        <Card className="p-5 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-accent/10 to-background border-accent/30 rounded-xl glow-effect">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-full">
              <TrendingUpIcon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-base font-semibold">
              {isResolved ? 'Market Status' : 'Probability Estimate'}
            </h3>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="text-4xl font-bold bg-gradient-to-br from-primary to-brand bg-clip-text text-transparent">
              {probability}
            </div>
            <div className="text-sm text-muted-foreground bg-accent/10 px-3 py-1.5 rounded-full border border-accent/20">
              {isResolved 
                ? (probability === "100%" ? 'event occurred' : 'event did not occur') 
                : 'likelihood based on research'}
            </div>
          </div>
          
          {reasoning && (
            <div className="mt-5 border-t pt-4 border-accent/20">
              <div className="flex items-center gap-2 mb-2">
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {isResolved ? 'Explanation' : 'Reasoning'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed bg-accent/5 p-3 rounded-lg border border-accent/10">
                {reasoning}
              </p>
            </div>
          )}
        </Card>
      )}

      {areasForResearch && areasForResearch.length > 0 && (
        <Card className="p-5 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-accent/5 to-background border-accent/20 rounded-xl glow-effect">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-500/10 p-2 rounded-full">
              <LightbulbIcon className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-base font-semibold">Areas for Further Research</h3>
            {onResearchArea && (
              <Badge variant="outline" className="ml-auto">Click any area to investigate</Badge>
            )}
          </div>
          <div className="space-y-3">
            {areasForResearch.map((area, index) => {
              const matchingChild = findMatchingChildResearch(area);
              
              return (
                <div 
                  key={index} 
                  className={`flex gap-3 p-3 rounded-lg transition-colors border ${
                    matchingChild 
                      ? 'bg-accent/10 border-accent/30' 
                      : onResearchArea 
                        ? 'hover:bg-accent/10 border-accent/10 hover:border-accent/30 cursor-pointer' 
                        : 'border-accent/10'
                  }`}
                  onClick={!matchingChild && onResearchArea ? () => onResearchArea(area) : undefined}
                >
                  <Target className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm leading-relaxed">{area}</p>
                    
                    <div className="flex gap-2 mt-2">
                      {matchingChild ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs bg-brand/10 border border-brand/20 hover:bg-brand/20 hover-scale"
                          onClick={(e) => {
                            e.stopPropagation();
                            matchingChild.onView();
                          }}
                        >
                          <GitBranch className="h-3 w-3 mr-1" />
                          View derived research
                        </Button>
                      ) : onResearchArea ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs text-primary hover:bg-primary/10 flex items-center gap-1 hover-scale"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResearchArea(area);
                          }}
                        >
                          <ArrowRightCircle className="h-3 w-3" />
                          Create focused research
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {childResearches && childResearches.length > 0 && (
        <Card className="p-4 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-indigo-500/10 to-background border-indigo-500/30 rounded-xl glow-effect">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"></div>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 p-2 rounded-full">
              <GitBranch className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">All Derived Research</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This research has spawned {childResearches.length} focused deep-dives
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {childResearches.map((child) => (
              <div key={child.id} className="bg-accent/10 p-3 rounded-lg border border-accent/20 flex justify-between items-center hover:bg-accent/20 transition-colors">
                <div>
                  <div className="text-sm font-medium">{child.focusText}</div>
                </div>
                <Button 
                  onClick={child.onView}
                  variant="outline" 
                  size="sm"
                  className="gap-1 hover-scale"
                >
                  View Research
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
