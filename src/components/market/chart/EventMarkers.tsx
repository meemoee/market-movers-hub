import * as React from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIndicator } from './EventIndicator';

interface EventMarkersProps {
  events: MarketEvent[];
  timeScale: ScaleTime<number, number>;
  height: number;
  iconsOnly?: boolean;
}

export const EventMarkers = ({ 
  events, 
  timeScale, 
  height,
  iconsOnly = false
}: EventMarkersProps) => {
  if (!events?.length) return null;

  return (
    <g>
      {events.map((event) => (
        <EventIndicator
          key={event.id}
          event={event}
          timeScale={timeScale}
          height={height}
          iconsOnly={iconsOnly}
        />
      ))}
    </g>
  );
};
