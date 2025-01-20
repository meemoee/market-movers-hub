import { scaleTime } from '@visx/scale';
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIndicator } from './EventIndicator';

interface EventMarkersProps {
  events: MarketEvent[];
  timeScale: ScaleTime<number, number>;
  height: number;
}

export const EventMarkers = ({ events, timeScale, height }: EventMarkersProps) => {
  if (!events?.length) return null;

  return (
    <g>
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
};