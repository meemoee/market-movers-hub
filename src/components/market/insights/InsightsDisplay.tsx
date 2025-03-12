
import { Target, ArrowDown, AlertCircle, ExternalLink, CheckCircle, XCircle, History, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
    reasoning?: {
      evidenceFor?: string[];
      evidenceAgainst?: string[];
      historicalPrecedents?: string[];
      resolutionAnalysis?: string;
    };
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
  // Use either direct props or streaming state
  const displayProbability = probability || streamingState?.parsedData?.probability || "Unknown";
  const displayAreas = areasForResearch || streamingState?.parsedData?.areasForResearch || [];
  const reasoning = streamingState?.parsedData?.reasoning;
  
  // Check if market is resolved (100% or 0%)
  const isResolved = displayProbability === "100%" || displayProbability === "0%";
  
  // Get probability color  
  const getProbabilityColor = (prob: string) => {
    const numericProb = parseInt(prob.replace('%', ''))
    return numericProb >= 50 ? 'from-green-500/10 to-background border-green-500/20' : 'from-red-500/10 to-background border-red-500/20'
  }

  return (
    <div className="space-y-4">
      <Card className={`p-4 relative border-2 shadow-md bg-gradient-to-br ${getProbabilityColor(displayProbability)} rounded-xl`}>
        <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {isResolved ? 'Market Status:' : 'Probability:'} {displayProbability}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {isResolved 
              ? (displayProbability === "100%" ? '(event occurred)' : '(event did not occur)') 
              : ''}
          </span>
        </div>
        
        {reasoning && (
          <div className="mt-3">
            {reasoning.evidenceFor && reasoning.evidenceFor.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium">Evidence Supporting Outcome</span>
                </div>
                <ScrollArea className="max-h-[120px]">
                  <ul className="space-y-1 pl-5 list-disc marker:text-green-500">
                    {reasoning.evidenceFor.map((item, index) => (
                      <li key={index} className="text-xs text-muted-foreground">{item}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
            
            {reasoning.evidenceAgainst && reasoning.evidenceAgainst.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-medium">Evidence Against Outcome</span>
                </div>
                <ScrollArea className="max-h-[120px]">
                  <ul className="space-y-1 pl-5 list-disc marker:text-red-500">
                    {reasoning.evidenceAgainst.map((item, index) => (
                      <li key={index} className="text-xs text-muted-foreground">{item}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
            
            {reasoning.historicalPrecedents && reasoning.historicalPrecedents.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <History className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium">Historical Precedents</span>
                </div>
                <ScrollArea className="max-h-[120px]">
                  <ul className="space-y-1 pl-5 list-disc marker:text-blue-500">
                    {reasoning.historicalPrecedents.map((item, index) => (
                      <li key={index} className="text-xs text-muted-foreground">{item}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
            
            {reasoning.resolutionAnalysis && isResolved && (
              <div className="mt-3 p-2 bg-accent/10 rounded-md border border-accent/20">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-accent" />
                  <span className="text-xs font-medium">Resolution Explanation</span>
                </div>
                <p className="text-xs text-muted-foreground">{reasoning.resolutionAnalysis}</p>
              </div>
            )}
          </div>
        )}
      </Card>
        
      {Array.isArray(displayAreas) && 
       displayAreas.length > 0 && (
        <Card className="p-4 overflow-hidden relative border-2 shadow-md bg-gradient-to-br from-amber-500/5 to-background border-amber-500/20 rounded-xl">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Areas Needing Research</span>
          </div>
          <ScrollArea className="max-h-[200px]">
            <ul className="space-y-1">
              {displayAreas.map((area, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-center gap-2 group p-1 hover:bg-accent/10 rounded-md">
                  <ArrowDown className="h-3 w-3 text-amber-500 flex-shrink-0" />
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
          
          {childResearches && childResearches.length > 0 && (
            <>
              <Separator className="my-3" />
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
        </Card>
      )}
    </div>
  )
}
