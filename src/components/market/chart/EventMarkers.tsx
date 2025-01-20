import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIndicator } from './EventIndicator';

interface EventMarkersProps {
  events: MarketEvent[];
  timeScale: ScaleTime<number, number>;
  height: number;
}

export function EventMarkers({ events, timeScale, height }: EventMarkersProps) {
  return (
    <g className="event-markers">
      {events.map((event) => (
        <EventIndicator
          key={event.id}
          event={event}
          timeScale={timeScale}
          height={height}
        />
      ))}
    </g>
  );
}