import { useMemo } from 'react';
import { MarketEvent } from './types';
import { ScaleTime } from 'd3-scale';
import { Info, AlertCircle, CheckCircle, XCircle, ArrowUp, ArrowDown } from 'lucide-react';
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
  
  const IconComponent = useMemo(() => {
    switch (event.icon) {
      case 'info':
        return Info;
      case 'alert':
        return AlertCircle;
      case 'success':
        return CheckCircle;
      case 'error':
        return XCircle;
      case 'up':
        return ArrowUp;
      case 'down':
        return ArrowDown;
      default:
        return Info;
    }
  }, [event.icon]);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <g>
            <line
              x1={xPosition}
              x2={xPosition}
              y1={0}
              y2={height}
              stroke="#4a5568"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <foreignObject
              x={xPosition - (iconSize / 2)}
              y={height - iconSize - 4}
              width={iconSize}
              height={iconSize}
              style={{ cursor: 'pointer' }}
            >
              <IconComponent 
                size={iconSize} 
                className="text-muted-foreground hover:text-foreground transition-colors" 
              />
            </foreignObject>
          </g>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <div className="space-y-1">
            <p className="font-medium">{event.title}</p>
            {event.description && (
              <p className="text-sm text-muted-foreground">{event.description}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};