
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import PriceChart from '../market/PriceChart';
import { toast } from 'sonner';

interface PriceHistoryViewProps {
  marketId: string | null;
  question: string;
}

export function PriceHistoryView({ marketId, question }: PriceHistoryViewProps) {
  const [selectedChartInterval, setSelectedChartInterval] = useState('1d');

  const { data: priceHistory, isLoading: isPriceLoading } = useQuery({
    queryKey: ['priceHistory', marketId, selectedChartInterval],
    queryFn: async () => {
      if (!marketId) return { points: [], lastUpdated: null };
      
      try {
        const response = await supabase.functions.invoke<{ t: string; y: number; lastUpdated?: number }[]>('price-history', {
          body: JSON.stringify({ 
            marketId, 
            interval: selectedChartInterval,
            fetchAllIntervals: true // Always request all intervals to be stored
          })
        });

        if (response.error) {
          console.error('Price history error:', response.error);
          toast.error(`Failed to load price history: ${response.error.message}`);
          throw response.error;
        }
        
        return {
          points: response.data.map(point => ({
            time: new Date(point.t).getTime(),
            price: point.y * 100
          })),
          lastUpdated: response.data[0]?.lastUpdated
        };
      } catch (error) {
        console.error('Error fetching price history:', error);
        toast.error('Could not load price history. Please try again later.');
        throw error;
      }
    },
    enabled: !!marketId,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
  });

  const { data: marketEvents, isLoading: isEventsLoading } = useQuery({
    queryKey: ['marketEvents', marketId],
    queryFn: async () => {
      if (!marketId) return [];
      
      try {
        const { data, error } = await supabase
          .from('market_events')
          .select('*')
          .eq('market_id', marketId)
          .order('timestamp', { ascending: true });

        if (error) {
          console.error('Market events error:', error);
          toast.error(`Failed to load market events: ${error.message}`);
          throw error;
        }

        return data.map(event => ({
          ...event,
          timestamp: new Date(event.timestamp).getTime()
        }));
      } catch (error) {
        console.error('Error fetching market events:', error);
        toast.error('Could not load market events. Please try again later.');
        throw error;
      }
    },
    enabled: !!marketId,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
  });

  const isLoading = isPriceLoading || isEventsLoading;

  const formatLastUpdated = (timestamp?: number) => {
    if (!timestamp) return null;
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  if (!marketId) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Select a holding to view its price history
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">Price History for {question}</div>
          {priceHistory?.lastUpdated && (
            <div className="text-xs text-muted-foreground">
              Last updated: {formatLastUpdated(priceHistory.lastUpdated)}
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : priceHistory?.points && priceHistory.points.length > 0 ? (
          <PriceChart
            data={priceHistory.points}
            events={marketEvents || []}
            selectedInterval={selectedChartInterval}
            onIntervalSelect={setSelectedChartInterval}
          />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No price history available
          </div>
        )}
      </div>
    </div>
  );
}
