
import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QueryEffectivenessIndicatorProps {
  score: number;
  className?: string;
}

export function QueryEffectivenessIndicator({ 
  score, 
  className 
}: QueryEffectivenessIndicatorProps) {
  // Determine color and icon based on score
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

  const getTooltipText = () => {
    if (score >= 7) return "Highly effective queries yielding relevant results";
    if (score >= 4) return "Moderately effective queries with some relevant information";
    return "Queries need refinement to gather more relevant information";
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center">
              {getIcon()}
              <span className="ml-1 text-sm font-medium">Query Effectiveness</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getTooltipText()}</p>
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
