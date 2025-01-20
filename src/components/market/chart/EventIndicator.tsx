import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    <Tooltip>
      <TooltipTrigger asChild>
        <g 
          transform={`translate(${xPosition}, 0)`}
          className="group"
          style={{ cursor: 'pointer' }}
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
          <g 
            transform={`translate(${-iconSize / 2}, ${height - iconSize - 4})`}
            style={{ pointerEvents: 'all' }}
          >
            <rect
              width={iconSize + 8}
              height={iconSize + 8}
              x={-4}
              y={-4}
              fill="hsl(var(--background))"
              fillOpacity={0.8}
              rx={4}
              className="group-hover:fill-accent"
            />
            <EventIcon
              type={event.icon}
              size={iconSize}
              className="text-muted-foreground group-hover:text-foreground"
            />
          </g>
        </g>
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="max-w-[240px] p-3"
        sideOffset={5}
      >
        <div className="space-y-1">
          <p className="font-medium text-sm">{event.title}</p>
          {event.description && (
            <p className="text-xs text-muted-foreground">{event.description}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};