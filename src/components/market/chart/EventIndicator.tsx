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
  
  return (
    <g transform={`translate(${xPosition}, 0)`} style={{ pointerEvents: 'all' }}>
      {/* Vertical connecting line */}
      <line
        x1={0}
        x2={0}
        y1={0}
        y2={height - 10} // Stop slightly above icon
        stroke="currentColor"
        strokeWidth={1}
        className="text-muted-foreground/30"
        strokeDasharray="2,2"
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Interactive icon container */}
      <g transform={`translate(0, ${iconY})`} className="cursor-pointer">
        {/* Larger invisible hit area for better interaction */}
        <rect
          x={-12}
          y={-12}
          width={24}
          height={24}
          fill="transparent"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        />
        
        {/* Icon background */}
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
            style={{ 
              overflow: 'visible', 
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            <div className="relative z-50 bg-background/95 border border-border p-2 rounded-md shadow-lg">
              <p className="font-medium text-sm">{event.title}</p>
              {event.description && (
                <p className="text-xs text-muted-foreground">{event.description}</p>
              )}
            </div>
          </foreignObject>
        )}
      </g>
    </g>
  );
};
