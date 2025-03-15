
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowRightCircle, ThumbsUp, ThumbsDown } from "lucide-react";

interface InsightsDisplayProps {
  streamingState: {
    parsedData?: {
      probability?: string;
      areasForResearch?: string[];
      reasoning?: {
        evidenceFor?: string[];
        evidenceAgainst?: string[];
      } | string;  // Updated to allow string type
    };
    rawText?: string;
  };
  onResearchArea: (area: string) => void;
  bestBid?: number;
  bestAsk?: number;
  outcomes?: string[];
}

export function InsightsDisplay({ 
  streamingState, 
  onResearchArea,
  bestBid,
  bestAsk,
  outcomes 
}: InsightsDisplayProps) {
  const { parsedData } = streamingState;
  
  if (!parsedData) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Loading insights...</span>
      </div>
    );
  }
  
  // Extract the numeric probability from string like "75%" or "75 percent"
  const getProbabilityValue = (probString?: string): number | null => {
    if (!probString) return null;
    
    const matches = probString.match(/(\d+)/);
    if (matches && matches[1]) {
      return parseInt(matches[1], 10);
    }
    return null;
  };
  
  const probability = getProbabilityValue(parsedData.probability);

  // Determine if any outcomes are a good buy based on the probability
  const getGoodBuyOpportunities = () => {
    if (!probability || !outcomes || (!bestBid && !bestAsk)) {
      return null;
    }
    
    // For the first outcome, compare with probability directly
    // For the second outcome, compare with inverse probability (100 - probability)
    const result = [];
    
    if (outcomes.length >= 1 && bestAsk) {
      // First outcome - compare with extracted probability
      const askPercentage = Math.round(bestAsk * 100);
      if (askPercentage < probability) {
        result.push({
          outcome: outcomes[0],
          price: askPercentage,
          probability: probability
        });
      }
    }
    
    if (outcomes.length >= 2 && bestBid) {
      // Second outcome - compare with inverse probability
      const bidPercentage = Math.round(bestBid * 100);
      const inverseProb = 100 - probability;
      if (bidPercentage < inverseProb) {
        result.push({
          outcome: outcomes[1] || "No",
          price: bidPercentage,
          probability: inverseProb
        });
      }
    }
    
    return result.length > 0 ? result : null;
  };
  
  const goodBuyOpportunities = getGoodBuyOpportunities();
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-lg font-semibold">
            Probability: {parsedData.probability || "Unknown"}
          </span>
          {probability !== null && (
            <Badge variant={probability > 50 ? "default" : "secondary"}>
              {probability > 90 ? "Very Likely" : 
               probability > 70 ? "Likely" : 
               probability > 50 ? "More Likely Than Not" : 
               probability > 30 ? "Unlikely" : 
               "Very Unlikely"}
            </Badge>
          )}
        </div>
      </div>
      
      {goodBuyOpportunities && goodBuyOpportunities.length > 0 && (
        <Card className="p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900">
          <h4 className="text-green-800 dark:text-green-400 font-medium mb-2">Good Buy Opportunities:</h4>
          <div className="space-y-2">
            {goodBuyOpportunities.map((opportunity, idx) => (
              <div key={idx} className="flex items-center">
                <ThumbsUp className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" />
                <span>
                  <strong>{opportunity.outcome}</strong> at {opportunity.price}% 
                  (Research suggests {opportunity.probability}% probability)
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {parsedData.areasForResearch && parsedData.areasForResearch.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Areas for Further Research:</h4>
          <div className="flex flex-wrap gap-2">
            {parsedData.areasForResearch.map((area, index) => (
              <Button 
                key={index} 
                variant="outline" 
                size="sm"
                className="flex items-center text-xs"
                onClick={() => onResearchArea(area)}
              >
                <ArrowRightCircle className="h-3 w-3 mr-1 inline" />
                {area}
              </Button>
            ))}
          </div>
        </div>
      )}
      
      {parsedData.reasoning && (
        <div className="space-y-4 mt-4">
          {typeof parsedData.reasoning === 'object' && parsedData.reasoning.evidenceFor && parsedData.reasoning.evidenceFor.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <ThumbsUp className="h-4 w-4 text-green-600 mr-1" />
                Evidence Supporting
              </h4>
              <ul className="space-y-2 text-sm">
                {parsedData.reasoning.evidenceFor.map((evidence, idx) => (
                  <li key={idx} className="bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-100 dark:border-green-900">
                    {evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {typeof parsedData.reasoning === 'object' && parsedData.reasoning.evidenceAgainst && parsedData.reasoning.evidenceAgainst.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <ThumbsDown className="h-4 w-4 text-red-600 mr-1" />
                Evidence Against
              </h4>
              <ul className="space-y-2 text-sm">
                {parsedData.reasoning.evidenceAgainst.map((evidence, idx) => (
                  <li key={idx} className="bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-100 dark:border-red-900">
                    {evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Handle string reasoning for backward compatibility */}
          {typeof parsedData.reasoning === 'string' && (
            <div>
              <h4 className="text-sm font-medium mb-2">Reasoning:</h4>
              <div className="text-sm p-2 bg-gray-50 dark:bg-gray-900/30 rounded border border-gray-100 dark:border-gray-800">
                {parsedData.reasoning}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
