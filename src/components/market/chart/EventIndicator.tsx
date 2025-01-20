import { useMemo } from 'react';
import { MarketEvent } from './types';
import { ScaleTime, ScaleLinear } from 'd3-scale';
import * as Icons from 'lucide-react';
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
    const iconMap: Record<string, keyof typeof Icons> = {
      'info': 'Info',
      'alert': 'AlertCircle',
      'success': 'CheckCircle',
      'error': 'XCircle',
      'up': 'ArrowUp',
      'down': 'ArrowDown'
    };
    
    const IconName = iconMap[event.icon] || 'Info';
    return Icons[IconName];
  }, [event.icon]);

  return (
    <TooltipProvider>
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
            >
              <IconComponent size={iconSize} className="text-muted-foreground" />
            </foreignObject>
          </g>
        </TooltipTrigger>
        <TooltipContent>
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