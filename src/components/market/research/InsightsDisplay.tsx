
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Info, ExternalLink } from 'lucide-react'
import { 
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Checkbox } from "@/components/ui/checkbox"

interface InsightsDisplayProps {
  streamingState: any
  onResearchArea?: (area: string) => void
  marketData?: {
    bestBid?: number
    bestAsk?: number
    outcomes?: string[]
  }
}

export function InsightsDisplay({ 
  streamingState,
  onResearchArea,
  marketData 
}: InsightsDisplayProps) {
  const [showModelReasoning, setShowModelReasoning] = useState(false)
  
  if (!streamingState || !streamingState.parsedData) {
    return <div className="text-sm italic text-muted-foreground">No insights available yet</div>
  }

  const insights = streamingState.parsedData
  const { probability, areasForResearch = [], reasoning = {}, modelReasoning } = insights
  
  const { evidenceFor = [], evidenceAgainst = [] } = reasoning

  const hasEvidence = evidenceFor.length > 0 || evidenceAgainst.length > 0
  const hasResearchAreas = areasForResearch && areasForResearch.length > 0
  const hasProbability = probability && typeof probability === 'string'
  const hasModelReasoning = modelReasoning && typeof modelReasoning === 'string'
  
  return (
    <div className="space-y-4">
      {hasProbability && (
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium">Probability Estimate</h3>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Info size={16} className="text-muted-foreground cursor-help" />
                </HoverCardTrigger>
                <HoverCardContent className="w-80 text-sm">
                  <p>
                    This probability represents the likelihood of the event occurring based on analysis of the available evidence.
                  </p>
                </HoverCardContent>
              </HoverCard>
            </div>
            
            <Badge variant="outline" className="text-xl bg-accent/10">
              {probability}
            </Badge>
          </div>
          
          {insights.goodBuyOpportunities && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3 mt-2">
              <h4 className="font-medium text-green-800 dark:text-green-400 mb-1">Potential Value Opportunities</h4>
              {insights.goodBuyOpportunities.map((opportunity: any, i: number) => (
                <div key={i} className="text-sm flex items-center gap-2 text-green-700 dark:text-green-300">
                  <ArrowRight size={14} />
                  <span>
                    {opportunity.outcome}: Predicted {(opportunity.predictedProbability * 100).toFixed(0)}% vs Market {(opportunity.marketPrice * 100).toFixed(0)}%
                    {' '}({opportunity.difference > 0 ? '+' : ''}{(opportunity.difference * 100).toFixed(0)} point difference)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasModelReasoning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox 
              id="show-reasoning" 
              checked={showModelReasoning}
              onCheckedChange={(checked) => setShowModelReasoning(checked === true)}
            />
            <label 
              htmlFor="show-reasoning" 
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Show model reasoning
            </label>
          </div>
          
          {showModelReasoning && (
            <div className="border border-muted rounded-md p-3 bg-muted/5 text-sm max-h-[400px] overflow-y-auto">
              <ReactMarkdown className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                {modelReasoning}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
      
      {hasResearchAreas && (
        <div className="space-y-2">
          <h3 className="text-md font-medium">Areas for Further Research</h3>
          <div className="flex flex-wrap gap-2">
            {areasForResearch.map((area: string, i: number) => (
              <Badge 
                key={i} 
                variant="secondary" 
                className="cursor-pointer hover:bg-secondary/80 flex items-center gap-1"
                onClick={() => onResearchArea && onResearchArea(area)}
              >
                {area}
                <ExternalLink size={12} />
              </Badge>
            ))}
          </div>
        </div>
      )}
      
      {hasEvidence && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="text-md font-medium text-green-600 dark:text-green-400">Evidence Supporting</h3>
            {evidenceFor.length > 0 ? (
              <ul className="space-y-2 list-disc pl-5">
                {evidenceFor.map((point: string, i: number) => (
                  <li key={i} className="text-sm">{point}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic text-muted-foreground">No supporting evidence provided</p>
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-md font-medium text-red-600 dark:text-red-400">Evidence Against</h3>
            {evidenceAgainst.length > 0 ? (
              <ul className="space-y-2 list-disc pl-5">
                {evidenceAgainst.map((point: string, i: number) => (
                  <li key={i} className="text-sm">{point}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic text-muted-foreground">No evidence against provided</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
