
import { Target, ArrowDown, AlertCircle, ExternalLink, TrendingUp, ChevronRight, Check, X, Brain } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface MarketData {
  bestBid?: number;
  bestAsk?: number;
  outcomes?: string[];
}

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
    reasoningTokens?: string;
  } | null;
}

interface InsightsDisplayProps {
  probability?: string;
  areasForResearch?: string[];
  streamingState?: StreamingState;
  onResearchArea?: (area: string) => void;
  parentResearch?: ParentResearch;
  childResearches?: ChildResearch[];
  marketData?: MarketData;
}

export function InsightsDisplay({ 
  probability, 
  areasForResearch, 
  streamingState,
  onResearchArea,
  parentResearch,
  childResearches,
  marketData
}: InsightsDisplayProps) {
  const [showReasoningTokens, setShowReasoningTokens] = useState(false);
  
  const getProbabilityColor = (prob: string) => {
    const numericProb = parseInt(prob.replace('%', ''));
    return numericProb >= 50 ? 'bg-green-500/10' : 'bg-red-500/10';
  }

  // Use either direct props or streaming state
  const displayProbability = probability || streamingState?.parsedData?.probability || "Unknown";
  const displayAreas = areasForResearch || streamingState?.parsedData?.areasForResearch || [];
  
  // Process reasoning data which can now be either a string or an object
  const reasoning = streamingState?.parsedData?.reasoning;
  const reasoningTokens = streamingState?.parsedData?.reasoningTokens;
  const evidenceFor: string[] = [];
  const evidenceAgainst: string[] = [];
  
  if (reasoning) {
    if (typeof reasoning === 'string') {
      // Legacy format: just a string
      // Do nothing with this case, will use the old rendering logic
    } else {
      // New format: object with evidenceFor and evidenceAgainst arrays
      if (reasoning.evidenceFor) {
        evidenceFor.push(...reasoning.evidenceFor);
      }
      if (reasoning.evidenceAgainst) {
        evidenceAgainst.push(...reasoning.evidenceAgainst);
      }
    }
  }

  // Calculate good buy opportunities if market data is available
  const goodBuyOpportunities = calculateGoodOpportunities(displayProbability, marketData);

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
            
            {/* Display the structured reasoning if available */}
            {(evidenceFor.length > 0 || evidenceAgainst.length > 0) && (
              <>
                <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Evidence Analysis:
                  </div>
                  
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-4">
                      {evidenceFor.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" />
                            <span>Evidence Supporting This Outcome:</span>
                          </div>
                          <ul className="space-y-2 pl-6">
                            {evidenceFor.map((evidence, index) => (
                              <li key={`for-${index}`} className="text-sm text-muted-foreground relative">
                                <span className="absolute left-[-1rem] top-1.5 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                                {evidence}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {evidenceAgainst.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                            <X className="h-4 w-4" />
                            <span>Evidence Against This Outcome:</span>
                          </div>
                          <ul className="space-y-2 pl-6">
                            {evidenceAgainst.map((evidence, index) => (
                              <li key={`against-${index}`} className="text-sm text-muted-foreground relative">
                                <span className="absolute left-[-1rem] top-1.5 h-1.5 w-1.5 rounded-full bg-red-500"></span>
                                {evidence}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}
            
            {/* Reasoning Tokens panel */}
            {reasoningTokens && (
              <>
                <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
                <div>
                  <Button 
                    onClick={() => setShowReasoningTokens(!showReasoningTokens)}
                    variant="outline" 
                    size="sm"
                    className="w-full justify-between mb-2"
                  >
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-medium">AI Reasoning Process</span>
                    </div>
                    <ChevronRight className={`h-4 w-4 transition-transform ${showReasoningTokens ? 'rotate-90' : ''}`} />
                  </Button>
                  
                  {showReasoningTokens && (
                    <ScrollArea className="max-h-[300px] mt-2 bg-accent/10 rounded-md p-3">
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {reasoningTokens}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </>
            )}
            
            {/* Fallback for old format reasoning (string type) */}
            {typeof reasoning === 'string' && reasoning && !reasoningTokens && (
              <>
                <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Reasoning:
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {reasoning}
                  </div>
                </div>
              </>
            )}
            
            {/* Good buy opportunities section */}
            {goodBuyOpportunities && goodBuyOpportunities.length > 0 && (
              <>
                <div className="h-px bg-black/10 dark:bg-white/10 my-3" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Potential Value Opportunities:
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2">
                      {goodBuyOpportunities.map((opportunity, index) => (
                        <div key={index} className="p-2 bg-green-500/10 rounded-md">
                          <div className="text-sm font-medium text-green-600 dark:text-green-400">
                            {opportunity.outcome}: {opportunity.difference > 0 ? '+' : ''}{opportunity.difference}%
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Model prediction: {(opportunity.predictedProbability * 100).toFixed(1)}% | 
                            Market price: {(opportunity.marketPrice * 100).toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}
            
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

// Helper function to calculate good buy opportunities
function calculateGoodOpportunities(probabilityStr: string, marketData?: MarketData) {
  if (!probabilityStr || !marketData || !marketData.bestAsk || !marketData.outcomes || marketData.outcomes.length < 2) {
    return null;
  }

  const probability = parseInt(probabilityStr.replace('%', '').trim()) / 100;
  if (isNaN(probability)) {
    return null;
  }
  
  const THRESHOLD = 0.05;
  const opportunities = [];
  
  const { bestAsk, bestBid } = marketData;
  
  if (probability > bestAsk + THRESHOLD) {
    opportunities.push({
      outcome: marketData.outcomes[0],
      predictedProbability: probability,
      marketPrice: bestAsk,
      difference: ((probability - bestAsk) * 100).toFixed(1)
    });
  }
  
  const inferredProbability = 1 - probability;
  const noAskPrice = 1 - (bestBid || 0);
  
  if (inferredProbability > noAskPrice + THRESHOLD) {
    opportunities.push({
      outcome: marketData.outcomes[1] || "NO",
      predictedProbability: inferredProbability,
      marketPrice: noAskPrice,
      difference: ((inferredProbability - noAskPrice) * 100).toFixed(1)
    });
  }
  
  return opportunities.length > 0 ? opportunities : null;
}
