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
  const xPosition = timeScale(event.timestamp);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <g 
            transform={`translate(${xPosition}, 0)`}
            style={{ cursor: 'pointer' }}
          >
            {/* Icon container */}
            <g transform={`translate(${-iconSize / 2}, 10)`}>
              <foreignObject
                width={iconSize + 16}
                height={iconSize + 16}
                x={-8}
                y={-8}
                style={{ overflow: 'visible' }}
              >
                <div className="p-1 rounded-full hover:bg-accent">
                  <EventIcon
                    type={event.icon}
                    size={iconSize}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  />
                </div>
              </foreignObject>
            </g>

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
    </TooltipProvider>
  );
}