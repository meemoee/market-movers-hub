import { ScaleTime } from 'd3-scale';
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

export const EventIndicator = ({ 
  event, 
  timeScale, 
  height, 
  iconSize = 16 
}: EventIndicatorProps) => {
  const xPosition = timeScale(event.timestamp);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            style={{ 
              position: 'absolute',
              left: `${xPosition}px`,
              top: 0,
              height: `${height}px`,
              width: `${iconSize}px`,
              transform: `translateX(-${iconSize / 2}px)`,
              cursor: 'pointer',
              pointerEvents: 'all',
            }}
            className="group"
          >
            {/* Vertical line */}
            <div 
              className="absolute left-1/2 top-0 w-px h-full bg-muted-foreground/30 group-hover:bg-muted-foreground/50 transition-colors"
              style={{ transform: 'translateX(-0.5px)' }}
            />
            
            {/* Icon container */}
            <div 
              className="absolute bottom-1 left-1/2 transform -translate-x-1/2 p-1 rounded-full bg-background/80 backdrop-blur-sm"
            >
              <EventIcon
                type={event.icon}
                size={iconSize}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </div>
          </div>
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
};