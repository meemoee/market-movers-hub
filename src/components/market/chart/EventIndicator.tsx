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
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <foreignObject
            x={xPosition - 16}
            y={height - 32}
            width={32}
            height={32}
            style={{ overflow: 'visible' }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <button
                type="button"
                className="p-1.5 rounded-full bg-background hover:bg-accent/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <EventIcon
                  type={event.icon}
                  size={iconSize}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                />
              </button>
            </div>
          </foreignObject>
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