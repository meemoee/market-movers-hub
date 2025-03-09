
import { Button } from "@/components/ui/button";
import { Lightbulb, Search } from "lucide-react";

export interface ResearchHeaderProps {
  isLoading: boolean;
  isAnalyzing: boolean;
  onResearch: () => void;
  focusText?: string;
  description?: string;
  marketPrice?: number;
  marketId?: string;
}

export function ResearchHeader({
  isLoading,
  isAnalyzing,
  onResearch,
  focusText,
  description,
  marketPrice,
  marketId
}: ResearchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-medium">Web Research</h2>
          <p className="text-sm text-muted-foreground">
            {focusText 
              ? `Research focused on: ${focusText}` 
              : 'Research the market question with AI assistance'}
          </p>
        </div>
      </div>
      
      <Button 
        onClick={onResearch} 
        disabled={isLoading || isAnalyzing}
        className="gap-1"
      >
        <Search className="h-4 w-4" />
        {isLoading
          ? "Researching..."
          : isAnalyzing
          ? "Analyzing..."
          : "Start Research"}
      </Button>
    </div>
  );
}
