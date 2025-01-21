import * as React from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';
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
  const [showTooltip, setShowTooltip] = React.useState(false);
  const xPosition = timeScale(new Date(event.timestamp).getTime());
  
  return (
    <g 
      transform={`translate(${xPosition}, 0)`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{ cursor: 'pointer' }}
      className="group"
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
          <div className="h-full w-full flex items-center justify-center">
            <EventIcon
              type={event.icon}
              size={iconSize}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </div>
        </foreignObject>
      </g>

      {/* Tooltip */}
      {showTooltip && (
        <foreignObject
          x={-120} // Center the 240px wide tooltip
          y={-120} // Position above the icon
          width={240}
          height={100}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div 
            className={cn(
              "absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[-8px]",
              "w-max max-w-[240px] rounded-md",
              "border border-border/50",
              "bg-background/95 px-3 py-2",
              "shadow-lg backdrop-blur-sm",
              "animate-in fade-in-0 zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            )}
          >
            <div className="space-y-1">
              <p className="font-medium text-sm">{event.title}</p>
              {event.description && (
                <p className="text-xs text-muted-foreground">{event.description}</p>
              )}
            </div>
            <div 
              className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-background border-r border-b border-border/50"
              aria-hidden="true"
            />
          </div>
        </foreignObject>
      )}
    </g>
  );
};
