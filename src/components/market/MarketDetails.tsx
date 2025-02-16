
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PriceChart from './PriceChart';
import { QADisplay } from './QADisplay';
import { WebResearchCard } from './WebResearchCard';
import { RelatedMarkets } from './RelatedMarkets';
import { SimilarHistoricalEvents } from './SimilarHistoricalEvents';

interface MarketDetailsProps {
  description?: string;
  marketId: string;
  question: string;
  selectedInterval: string;
  eventId?: string;
}

export function MarketDetails({
  description,
  marketId,
  question,
  selectedInterval,
  eventId
}: MarketDetailsProps) {
  const [selectedChartInterval, setSelectedChartInterval] = useState('1d');

  const { data: priceHistory, isLoading: isPriceLoading } = useQuery({
    queryKey: ['priceHistory', marketId, selectedChartInterval],
    queryFn: async () => {
      console.log('Fetching price history for market:', marketId);
      const response = await supabase.functions.invoke<{ t: string; y: number; lastUpdated?: number }[]>('price-history', {
        body: JSON.stringify({ marketId, interval: selectedChartInterval })
      });

      if (response.error) {
        console.error('Price history error:', response.error);
        throw response.error;
      }
      
      console.log('Price history response:', response.data);
      return {
        points: response.data.map(point => ({
          time: new Date(point.t).getTime(),
          price: point.y * 100
        })),
        lastUpdated: response.data[0]?.lastUpdated
      };
    },
    enabled: !!marketId
  });

  const { data: marketEvents, isLoading: isEventsLoading } = useQuery({
    queryKey: ['marketEvents', marketId],
    queryFn: async () => {
      console.log('Fetching market events for:', marketId);
      const { data, error } = await supabase
        .from('market_events')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Market events error:', error);
        throw error;
      }

      console.log('Market events response:', data);
      return data.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp).getTime()
      }));
    },
    enabled: !!marketId
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

  return (
    <div className="space-y-4">
      {/* Price History Section */}
      <div>
        <div className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">Price History</div>
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

      {/* Related Markets Section */}
      {eventId && (
        <RelatedMarkets 
          eventId={eventId}
          marketId={marketId}
          selectedInterval={selectedInterval}
        />
      )}

      {/* Web Research Section */}
      {description && (
        <WebResearchCard 
          description={description} 
          marketId={marketId}
        />
      )}

      {/* QA Tree Section */}
      <div className="mt-6 border-t border-border pt-4">
        <div className="text-sm text-muted-foreground mb-2">Analysis Tree</div>
        <QADisplay 
          marketId={marketId} 
          marketQuestion={question}
        />
      </div>

      {/* Similar Historical Events Section */}
      <div className="mt-6">
        <SimilarHistoricalEvents />
      </div>
    </div>
  );
}
