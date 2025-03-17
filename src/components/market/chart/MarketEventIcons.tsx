
import { MarketEvent } from "./types";
import { EventIcon } from "./EventIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

interface MarketEventIconsProps {
  events: MarketEvent[];
  xScale: any;
  height: number;
  onEventClick?: (event: MarketEvent) => void;
}

export function MarketEventIcons({ events, xScale, height, onEventClick }: MarketEventIconsProps) {
  if (!events || events.length === 0) return null;
  
  // Group events that are too close to each other
  const groupedEvents: { [key: string]: MarketEvent[] } = {};
  const eventGroups: MarketEvent[][] = [];
  const timeThreshold = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  // First, sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
  
  // Then group events that are close to each other
  let currentGroup: MarketEvent[] = [];
  let lastTimestamp = 0;
  
  sortedEvents.forEach(event => {
    if (currentGroup.length === 0 || event.timestamp - lastTimestamp < timeThreshold) {
      currentGroup.push(event);
    } else {
      eventGroups.push([...currentGroup]);
      currentGroup = [event];
    }
    lastTimestamp = event.timestamp;
  });
  
  if (currentGroup.length > 0) {
    eventGroups.push(currentGroup);
  }
  
  return (
    <g className="market-event-icons">
      {eventGroups.map((group, groupIndex) => {
        // Use the average timestamp for positioning the group
        const groupTimestamp = group.reduce((sum, event) => sum + event.timestamp, 0) / group.length;
        const xPos = xScale(groupTimestamp);
        
        if (isNaN(xPos)) return null;
        
        return (
          <TooltipProvider key={`group-${groupIndex}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <g 
                  transform={`translate(${xPos}, 20)`}
                  onClick={() => group.length === 1 && onEventClick ? onEventClick(group[0]) : null}
                  style={{ cursor: "pointer" }}
                >
                  {group.length === 1 ? (
                    <foreignObject 
                      width={24} 
                      height={24} 
                      x={-12} 
                      y={-12}
                      className="text-primary-foreground"
                    >
                      <div className="bg-accent rounded-full p-1 shadow-sm flex items-center justify-center">
                        <EventIcon type={group[0].icon || 'info'} size={16} />
                      </div>
                    </foreignObject>
                  ) : (
                    <g>
                      <circle r={12} fill="rgba(129, 140, 248, 0.25)" />
                      <text 
                        textAnchor="middle" 
                        dominantBaseline="central" 
                        fontSize={12}
                        fill="currentColor"
                      >
                        {group.length}
                      </text>
                    </g>
                  )}
                  <line 
                    x1={0} 
                    y1={10} 
                    x2={0} 
                    y2={height - 30} 
                    stroke="currentColor" 
                    strokeDasharray="2,2"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />
                </g>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">
                <div className="space-y-2">
                  {group.map((event, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-center gap-1.5 font-medium">
                        <EventIcon type={event.icon || 'info'} size={12} />
                        <span>{event.title}</span>
                      </div>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(event.timestamp), "MMM d, yyyy")}
                      </p>
                      {i < group.length - 1 && <hr className="my-1 border-border/50" />}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </g>
  );
}
