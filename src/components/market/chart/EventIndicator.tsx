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
            
            {/* Interactive area */}
            <g transform={`translate(0, ${height - 24})`}>
              <foreignObject
                width={32}
                height={32}
                x={-16}
                y={-16}
                style={{ overflow: 'visible' }}
              >
                <div 
                  className="w-full h-full flex items-center justify-center cursor-pointer"
                  style={{ touchAction: 'none' }}
                >
                  <div className="p-2 rounded-full hover:bg-accent/80 transition-colors">
                    <EventIcon
                      type={event.icon}
                      size={iconSize}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    />
                  </div>
                </div>
              </foreignObject>
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
    </TooltipProvider>
  );
}