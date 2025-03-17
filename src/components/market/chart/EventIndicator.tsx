
import * as React from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';

interface EventIndicatorProps {
  event: MarketEvent;
  timeScale: ScaleTime<number, number>;
  height: number;
  iconSize?: number;
  iconsOnly?: boolean;
}

export const EventIndicator = ({ 
  event, 
  timeScale, 
  height, 
  iconSize = 16,
  iconsOnly = false
}: EventIndicatorProps) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const xPosition = timeScale(new Date(event.timestamp).getTime());
  // Adjust the iconY position to be flush with x-axis by adding iconSize
  const iconY = height - (iconSize / 2);
  
  // If xPosition is outside the visible range, don't render
  if (isNaN(xPosition)) {
    return null;
  }
  
  // If iconsOnly is true, only render the interactive part
  if (iconsOnly) {
    return (
      <g transform={`translate(${xPosition}, 0)`} style={{ pointerEvents: 'all' }}>
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
            fill="#0000001a"
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
              x={-150}
              y={-120}
              width={300}
              height={100}
              style={{ 
                overflow: 'visible', 
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            >
              <div className="relative z-50 bg-background/95 border border-border p-2 rounded-md shadow-lg">
                <div className="flex items-center gap-2 mb-1">
                  <EventIcon type={event.icon} size={14} className="text-primary" />
                  <p className="font-medium text-sm">{event.title}</p>
                </div>
                {event.description && (
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                )}
                <p className="text-xs mt-1 text-muted-foreground/80">
                  {new Date(event.timestamp).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </foreignObject>
          )}
        </g>
      </g>
    );
  }

  // If not iconsOnly, just render the vertical line
  return (
    <g transform={`translate(${xPosition}, 0)`} style={{ pointerEvents: 'none' }}>
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
  );
};
