import * as React from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';

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
  const iconY = height - iconSize - 4;

  // Separate groups for line and interactive elements  
  return (
    <>
      {/* Non-interactive vertical line */}
      <g 
        transform={`translate(${xPosition}, 0)`} 
        style={{ pointerEvents: 'none' }}
      >
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
      </g>

      {/* Interactive icon and tooltip group */}
      <g 
        transform={`translate(${xPosition}, ${iconY})`}
        style={{ pointerEvents: 'all' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="cursor-pointer"
      >
        {/* Larger invisible hit area */}
        <rect
          x={-12}
          y={-12}
          width={24}
          height={24}
          fill="transparent"
          style={{ pointerEvents: 'all' }}
        />
        
        {/* Visual background */}
        <rect
          x={-10}
          y={-10}
          width={20}
          height={20}
          rx={4}
          fill="hsl(var(--background))"
          style={{ pointerEvents: 'none' }}
        />

        {/* Icon */}
        <g transform="translate(-8, -8)" style={{ pointerEvents: 'none' }}>
          <EventIcon
            type={event.icon}
            size={16}
            className="text-muted-foreground"
          />
        </g>

        {/* Tooltip */}
        {showTooltip && (
          <foreignObject
            x={-100}
            y={-80}
            width={200}
            height={60}
            style={{ overflow: 'visible', pointerEvents: 'none' }}
          >
            <div className="z-50 bg-background/95 border border-border p-2 rounded-md shadow-lg">
              <p className="font-medium text-sm">{event.title}</p>
              {event.description && (
                <p className="text-xs text-muted-foreground">{event.description}</p>
              )}
            </div>
          </foreignObject>
        )}
      </g>
    </>
  );
};
