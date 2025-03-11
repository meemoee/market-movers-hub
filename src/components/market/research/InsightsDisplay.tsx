
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, List, ArrowLeftCircle } from 'lucide-react';

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: string;
  } | null;
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

interface InsightsDisplayProps {
  streamingState: StreamingState;
  onResearchArea: (area: string) => void;
  parentResearch?: ParentResearch;
  childResearches?: ChildResearch[];
}

export function InsightsDisplay({ 
  streamingState, 
  onResearchArea,
  parentResearch,
  childResearches 
}: InsightsDisplayProps) {
  if (!streamingState.parsedData) return null;

  const handleAreaClick = (area: string) => {
    if (typeof area === 'string') {
      onResearchArea(area);
    } else {
      console.error("Invalid research area format:", area);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <div>Research Summary</div>
          <Badge variant="outline" className="text-lg font-semibold">
            {streamingState.parsedData.probability}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {streamingState.parsedData.reasoning && (
          <div className="text-sm">
            <p>{streamingState.parsedData.reasoning}</p>
          </div>
        )}
        
        {parentResearch && (
          <div className="flex items-center gap-2 text-sm mt-4">
            <ArrowLeftCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Parent Research:</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-xs hover:bg-accent"
              onClick={parentResearch.onView}
            >
              {parentResearch.focusText || 'View parent research'}
            </Button>
          </div>
        )}
        
        {childResearches && childResearches.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Child Researches:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {childResearches.map(child => (
                <Button 
                  key={child.id}
                  variant="outline" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={child.onView}
                >
                  {child.focusText || 'Unnamed research'}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {streamingState.parsedData.areasForResearch?.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <List className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Areas for Further Research:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {streamingState.parsedData.areasForResearch.map((area, index) => (
                <Button 
                  key={index}
                  variant="outline" 
                  size="sm"
                  onClick={() => handleAreaClick(area)}
                  className="h-6 px-2 text-xs"
                >
                  {typeof area === 'string' ? area : String(area)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
