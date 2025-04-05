
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoIcon, LightbulbIcon, Target, TrendingUpIcon, ArrowRightCircle, ArrowLeftIcon, GitBranch, CheckCircle, XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

interface ReasoningData {
  evidenceFor?: string[];
  evidenceAgainst?: string[];
}

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: ReasoningData | string;
    goodBuyOpportunities?: Array<{
      outcome: string;
      predictedProbability: number;
      marketPrice: number;
      difference: string;
    }> | null;
  } | null;
}

interface MarketData {
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number;
  noBestBid?: number; // Add missing property
  outcomes?: string[];
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
  marketData?: MarketData;
}

export function InsightsDisplay({ 
  streamingState, 
  onResearchArea, 
  parentResearch,
  childResearches,
  marketData
}: InsightsDisplayProps) {
  if (!streamingState.parsedData) return null;

  const { probability, areasForResearch, reasoning, goodBuyOpportunities } = streamingState.parsedData;
  
  const hasErrorInProbability = 
    !probability || 
    probability.toLowerCase().includes('error') || 
    probability.toLowerCase().includes('unknown') ||
    probability.toLowerCase().includes('parsing') ||
    probability.toLowerCase().includes('could not') ||
    probability.toLowerCase().includes('unable to') ||
    probability === "null" ||
    probability === "undefined";
  
  const isResolved = probability === "100%" || probability === "0%";

  if ((hasErrorInProbability && (!areasForResearch || areasForResearch.length === 0)) || 
      streamingState.rawText.length < 10) {
    return null;
  }

  const showProbabilityCard = probability && !hasErrorInProbability;

  const findMatchingChildResearch = (area: string): ResearchChild | undefined => {
    if (!childResearches) return undefined;
    return childResearches.find(child => 
      child.focusText.toLowerCase() === area.toLowerCase() ||
      area.toLowerCase().includes(child.focusText.toLowerCase()) ||
      child.focusText.toLowerCase().includes(area.toLowerCase())
    );
  };

  const evidenceFor: string[] = [];
  const evidenceAgainst: string[] = [];
  
  if (reasoning) {
    if (typeof reasoning === 'string') {
    } else {
      if (reasoning.evidenceFor) {
        evidenceFor.push(...reasoning.evidenceFor);
      }
      if (reasoning.evidenceAgainst) {
        evidenceAgainst.push(...reasoning.evidenceAgainst);
      }
    }
  }
  
  return (
    <div className="space-y-5">
      {parentResearch && (
        <Card className="p-4 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-blue-500/10 to-background border-blue-500/30 rounded-xl">
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
                className="ml-auto"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                View Parent Research
              </Button>
            )}
          </div>
          {parentResearch.focusText && (
            <div className="mt-3 bg-accent/20 p-2 rounded-md border border-accent/20">
              <div className="text-sm font-medium mb-1">Research Focus:</div>
              <div className="text-sm">{parentResearch.focusText}</div>
            </div>
          )}
        </Card>
      )}

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
          
          {goodBuyOpportunities && goodBuyOpportunities.length > 0 && (
            <div className="mt-4 space-y-3">
              {goodBuyOpportunities.map((opportunity, index) => {
                // Calculate the potential multiplier
                const potentialMultiplier = opportunity.predictedProbability / opportunity.marketPrice;
                const formattedMultiplier = potentialMultiplier.toFixed(1);
                
                return (
                  <div key={index} className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-green-700 dark:text-green-400">
                          Good Buy: {opportunity.outcome}
                        </span>
                      </div>
                      <Badge className="bg-green-600">{formattedMultiplier}x potential</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Research suggests {(opportunity.predictedProbability * 100).toFixed(0)}% probability vs market price of {(opportunity.marketPrice * 100).toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {(evidenceFor.length > 0 || evidenceAgainst.length > 0) && (
            <div className="mt-4 space-y-4 border-t pt-4 border-accent/20">
              {evidenceFor.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">
                      Evidence Supporting This Outcome
                    </span>
                  </div>
                  <ul className="space-y-2 pl-2">
                    {evidenceFor.map((evidence, index) => (
                      <li key={`for-${index}`} className="text-sm text-muted-foreground flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                        <span className="flex-1">{evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {evidenceAgainst.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">
                      Evidence Against This Outcome
                    </span>
                  </div>
                  <ul className="space-y-2 pl-2">
                    {evidenceAgainst.map((evidence, index) => (
                      <li key={`against-${index}`} className="text-sm text-muted-foreground flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
                        <span className="flex-1">{evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {typeof reasoning === 'string' && reasoning && (
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
            {onResearchArea && (
              <Badge variant="outline" className="ml-auto">Click any area to investigate</Badge>
            )}
          </div>
          <div className="space-y-4">
            {areasForResearch.map((area, index) => {
              const matchingChild = findMatchingChildResearch(area);
              
              return (
                <div 
                  key={index} 
                  className={`flex gap-3 p-2 rounded-lg transition-colors ${matchingChild ? 'bg-accent/10' : onResearchArea ? 'hover:bg-accent/10 cursor-pointer' : ''}`}
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
                          className="h-8 text-xs"
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
                          className="h-8 text-xs text-primary hover:bg-primary/10 flex items-center gap-1"
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
        <Card className="p-4 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-indigo-500/10 to-background border-indigo-500/30 rounded-xl">
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
          <div className="mt-3 space-y-2">
            {childResearches.map((child) => (
              <div key={child.id} className="bg-accent/20 p-2 rounded-md border border-accent/20 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">Focus: {child.focusText}</div>
                </div>
                <Button 
                  onClick={child.onView}
                  variant="outline" 
                  size="sm"
                >
                  <ArrowRightCircle className="h-4 w-4 mr-2" />
                  View Research
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
