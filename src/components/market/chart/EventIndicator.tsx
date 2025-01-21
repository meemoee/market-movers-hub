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

  // Calculate icon position
  const iconX = -iconSize / 2;
  const iconY = height - iconSize - 4;
  
  return (
    <g transform={`translate(${xPosition}, 0)`}>
      {/* Vertical line */}
      <line
        x1={0}
        x2={0}
        y1={0}
        y2={height}
        stroke="currentColor"
        strokeWidth={1}
        className="text-muted-foreground/30"
        strokeDasharray="2,2"
      />
      
      {/* Clickable background + icon container */}
      <g transform={`translate(${iconX}, ${iconY})`}>
        {/* Larger hit area */}
        <rect
          x={-6}
          y={-6}
          width={iconSize + 12}
          height={iconSize + 12}
          rx={6}
          fill="transparent"
          cursor="pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="stroke-border hover:stroke-2"
        />
        
        {/* Visual background */}
        <rect
          x={-4}
          y={-4}
          width={iconSize + 8}
          height={iconSize + 8}
          rx={4}
          className="fill-background hover:fill-accent transition-colors"
          pointerEvents="none"
        />

        {/* Icon */}
        <g transform={`translate(0, 0)`}>
          <EventIcon
            type={event.icon}
            size={iconSize}
            className="text-muted-foreground transition-colors pointer-events-none"
          />
        </g>

        {/* Tooltip */}
        {showTooltip && (
          <g transform={`translate(${iconSize/2}, ${-8})`}>
            <foreignObject
              x={-120}
              y={-70}
              width={240}
              height={60}
              style={{ overflow: 'visible' }}
            >
              <div 
                className={cn(
                  "absolute p-2 rounded-md",
                  "z-50 min-w-[160px]",
                  "border border-border/50",
                  "bg-background/95 backdrop-blur-sm",
                  "shadow-lg"
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
                />
              </div>
            </foreignObject>
          </g>
        )}
      </g>
    </g>
  );
};
