import { useState, useRef, useEffect } from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';
import { CustomEventTooltip } from './CustomEventTooltip';

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
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<SVGGElement>(null);
  
  const xPosition = timeScale(new Date(event.timestamp).getTime());

  useEffect(() => {
    const updateTooltipPosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y;
        setTooltipPosition({ x, y });
      }
    };

    if (showTooltip) {
      updateTooltipPosition();
    }
  }, [showTooltip]);

  return (
    <>
      <g 
        ref={containerRef}
        transform={`translate(${xPosition}, 0)`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ pointerEvents: 'bounding-box' }}
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
            fill="hsl(var(--background))"
            fillOpacity={0.8}
            rx={4}
            className="group-hover:fill-accent transition-colors"
          />
          <foreignObject 
            width={iconSize} 
            height={iconSize}
            style={{ pointerEvents: 'none' }}
          >
            <EventIcon
              type={event.icon}
              size={iconSize}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </foreignObject>
        </g>
      </g>

      {showTooltip && (
        <CustomEventTooltip
          title={event.title}
          description={event.description}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      )}
    </>
  );
};