import * as React from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils";

interface EventIndicatorProps {
  event: MarketEvent;
  timeScale: ScaleTime<number, number>;
  height: number;
  iconSize?: number;
}

export const EventIndicator = ({ 
  event, 
  timeScale, 
  height, 
  iconSize = 16 
}: EventIndicatorProps) => {
  const xPosition = timeScale(new Date(event.timestamp).getTime());
  
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <g 
            transform={`translate(${xPosition}, 0)`}
            className="group cursor-pointer"
          >
            {/* Vertical line */}
            <line
              x1={0}
              x2={0}
              y1={0}
              y2={height}
              stroke="currentColor"
              strokeWidth={1}
              className="text-muted-foreground/30 group-hover:text-muted-foreground/50"
              strokeDasharray="2,2"
            />
            
            {/* Icon container */}
            <g transform={`translate(${-iconSize / 2}, ${height - iconSize - 4})`}>
              <rect
                width={iconSize + 8}
                height={iconSize + 8}
                x={-4}
                y={-4}
                className="fill-background group-hover:fill-accent transition-colors"
                rx={4}
              />
              <foreignObject 
                width={iconSize} 
                height={iconSize}
                style={{ pointerEvents: "none" }}
              >
                <EventIcon
                  type={event.icon}
                  size={iconSize}
                  className="text-muted-foreground group-hover:text-foreground transition-colors"
                />
              </foreignObject>
            </g>
          </g>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          align="center"
          className={cn(
            "z-50 px-3 py-1.5",
            "border border-border/50 bg-background/95 shadow-md",
            "backdrop-blur-sm"
          )}
        >
          <div className="space-y-1 max-w-[240px]">
            <p className="font-medium text-sm">{event.title}</p>
            {event.description && (
              <p className="text-xs text-muted-foreground">{event.description}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
