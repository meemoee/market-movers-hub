
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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch events from the database if marketId is provided and no events are passed as props
  useEffect(() => {
    if (marketId && (!propEvents || propEvents.length === 0)) {
      const fetchEvents = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
          console.log(`Fetching timeline events for market ${marketId}`);
          const { data, error } = await supabase
            .from('market_events')
            .select('*')
            .eq('market_id', marketId)
            .order('timestamp', { ascending: true });
            
          if (error) {
            console.error("Error fetching market events:", error);
            setError(error.message);
          } else if (data) {
            console.log(`Found ${data.length} timeline events for market ${marketId}`);
            
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
        } catch (err) {
          console.error("Failed to fetch market events:", err);
          setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchEvents();
    } else if (propEvents) {
      setEvents(propEvents);
    }
  }, [marketId, propEvents]);

  if (isLoading) return null;
  if (error) {
    console.error(`Error loading events: ${error}`);
    return null;
  }
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
