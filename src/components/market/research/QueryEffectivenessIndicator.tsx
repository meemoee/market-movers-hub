
import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QueryEffectivenessIndicatorProps {
  score: number;
  showLabel?: boolean;
  className?: string;
}

export function QueryEffectivenessIndicator({ 
  score, 
  showLabel = true, 
  className 
}: QueryEffectivenessIndicatorProps) {
  // Validate score is between 0-10
  const validScore = Math.min(Math.max(0, score), 10);
  
  const getColorClass = () => {
    if (score >= 7) return "bg-green-500";
    if (score >= 4) return "bg-amber-500";
    return "bg-red-500";
  };
  
  const getIcon = () => {
    if (score >= 7) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (score >= 4) return <Info className="h-4 w-4 text-amber-500" />;
    return <AlertTriangle className="h-4 w-4 text-red-500" />;
  };

  const getMessage = () => {
    if (score >= 7) return "High quality queries - providing relevant results";
    if (score >= 4) return "Moderate quality queries - some relevant information found";
    return "Low quality queries - consider refining search terms";
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              {getIcon()}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getMessage()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="relative w-20">
        <Progress 
          value={score * 10} 
          className={cn("h-2", getColorClass())}
        />
      </div>
      <span className="text-xs">{score}/10</span>
    </div>
  );
}
