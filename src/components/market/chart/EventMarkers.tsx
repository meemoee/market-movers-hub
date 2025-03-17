
import * as React from "react";
import { useEffect, useState } from "react";
import type { ScaleTime } from 'd3-scale';
import { MarketEvent } from './types';
import { EventIndicator } from './EventIndicator';
import { supabase } from "@/integrations/supabase/client";

interface EventMarkersProps {
  events?: MarketEvent[];
  timeScale: ScaleTime<number, number>;
  height: number;
  iconsOnly?: boolean;
  marketId?: string;
}

export const EventMarkers = ({ 
  events: propEvents,
  timeScale, 
  height,
  iconsOnly = false,
  marketId
}: EventMarkersProps) => {
  const [events, setEvents] = useState<MarketEvent[]>(propEvents || []);

  // Fetch events from the database if marketId is provided and no events are passed as props
  useEffect(() => {
    if (marketId && (!propEvents || propEvents.length === 0)) {
      const fetchEvents = async () => {
        const { data, error } = await supabase
          .from('market_events')
          .select('*')
          .eq('market_id', marketId)
          .order('timestamp', { ascending: true });
          
        if (!error && data) {
          // Convert database events to MarketEvent format
          const marketEvents: MarketEvent[] = data.map(event => ({
            id: event.id,
            event_type: event.event_type,
            title: event.title,
            description: event.description,
            timestamp: new Date(event.timestamp).getTime(),
            icon: event.icon
          }));
          
          setEvents(marketEvents);
        }
      };
      
      fetchEvents();
    } else if (propEvents) {
      setEvents(propEvents);
    }
  }, [marketId, propEvents]);

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
