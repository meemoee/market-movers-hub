import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIcon } from './EventIcon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EventIndicatorProps {
  event: MarketEvent;
  timeScale: ScaleTime<number, number>;
  height: number;
  iconSize?: number;
}

export function EventIndicator({ 
  event, 
  timeScale, 
  height, 
  iconSize = 16 
}: EventIndicatorProps) {
  const xPosition = timeScale(new Date(event.timestamp).getTime());
  
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <g 
            transform={`translate(${xPosition}, 0)`}
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
            
            {/* Interactive area for tooltip */}
            <rect
              x={-10}
              y={0}
              width={20}
              height={height}
              fill="transparent"
              className="cursor-pointer"
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
              />
              <foreignObject
                width={iconSize}
                height={iconSize}
                style={{ overflow: 'visible' }}
              >
                <EventIcon
                  type={event.icon}
                  size={iconSize}
                  className="text-muted-foreground group-hover:text-foreground"
                />
              </foreignObject>
            </g>
          </g>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-[240px] p-3 z-50"
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
    </TooltipProvider>
  );
}