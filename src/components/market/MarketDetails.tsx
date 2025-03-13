
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PriceChart from './PriceChart';
import { QADisplay } from './QADisplay';
import { WebResearchCard } from './WebResearchCard';
import { RelatedMarkets } from './RelatedMarkets';
import { SimilarHistoricalEvents } from './SimilarHistoricalEvents';
import { toast } from 'sonner';
import { DeepResearchCard } from './DeepResearchCard';

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
      try {
        const response = await supabase.functions.invoke<{ t: string; y: number; lastUpdated?: number }[]>('price-history', {
          body: JSON.stringify({ marketId, interval: selectedChartInterval })
        });

        if (response.error) {
          console.error('Price history error:', response.error);
          toast.error(`Failed to load price history: ${response.error.message}`);
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
      } catch (error) {
        console.error('Error fetching price history:', error);
        toast.error('Could not load price history. Please try again later.');
        throw error;
      }
    },
    enabled: !!marketId,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const currentMarketPrice = priceHistory?.points && priceHistory.points.length > 0 
    ? priceHistory.points[priceHistory.points.length - 1].price 
    : undefined;

  const { data: marketEvents, isLoading: isEventsLoading } = useQuery({
    queryKey: ['marketEvents', marketId],
    queryFn: async () => {
      console.log('Fetching market events for:', marketId);
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

        console.log('Market events response:', data);
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
  });

  const { data: latestResearchJob } = useQuery({
    queryKey: ['latestResearchJob', marketId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('market_id', marketId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Research job query error:', error);
          return null;
        }

        return data.length > 0 ? data[0] : null;
      } catch (error) {
        console.error('Error fetching research job:', error);
        return null;
      }
    },
    enabled: !!marketId,
    refetchInterval: (data) => {
      // Here data is the actual research job data returned from queryFn
      if (data && typeof data === 'object' && 'status' in data && ['queued', 'processing'].includes(data.status as string)) {
        return 5000;
      }
      return false;
    },
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

  const shouldShowQADisplay = marketId && question;
  
  const fullResearchContext = question ? 
    (description ? `${question} - ${description}` : question) : 
    (description || 'No description available');

  return (
    <div className="space-y-4">
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

      {eventId && (
        <RelatedMarkets 
          eventId={eventId}
          marketId={marketId}
          selectedInterval={selectedInterval}
        />
      )}

      {description && (
        <div>
          <WebResearchCard 
            description={fullResearchContext} 
            marketId={marketId}
            latestJob={latestResearchJob}
          />
        </div>
      )}

      {shouldShowQADisplay && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="text-sm text-muted-foreground mb-2">Analysis Tree</div>
          <QADisplay 
            marketId={marketId} 
            marketQuestion={question}
            marketDescription={description || 'No description available'}
          />
        </div>
      )}

      <div className="mt-6">
        <SimilarHistoricalEvents />
      </div>

      {description && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}
