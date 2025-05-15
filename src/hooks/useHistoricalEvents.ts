
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface HistoricalEvent {
  id: string;
  title: string;
  date: string;
  image_url: string;
  similarities: string[];
  differences: string[];
}

export const useHistoricalEvents = (marketId: string | undefined) => {
  const [isLoading, setIsLoading] = useState(false);

  const { data: historicalEvents, refetch } = useQuery({
    queryKey: ['historicalEvents', marketId],
    queryFn: async () => {
      if (!marketId) return [];
      
      setIsLoading(true);
      try {
        const { data: comparisons, error } = await supabase
          .from('market_historical_comparisons')
          .select(`
            historical_event_id,
            similarities,
            differences,
            historical_events:historical_event_id (
              id, 
              title,
              date,
              image_url
            )
          `)
          .eq('market_id', marketId);

        if (error) {
          console.error('Error fetching historical events:', error);
          toast.error('Failed to load historical events');
          return [];
        }

        return comparisons.map(comparison => ({
          id: comparison.historical_events.id,
          title: comparison.historical_events.title,
          date: comparison.historical_events.date,
          image_url: comparison.historical_events.image_url,
          similarities: comparison.similarities as string[],
          differences: comparison.differences as string[]
        }));
      } catch (error) {
        console.error('Error in historical events query:', error);
        toast.error('Failed to load historical events');
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    enabled: !!marketId,
  });

  return {
    historicalEvents: historicalEvents || [],
    isLoading,
    refetch,
  };
};
