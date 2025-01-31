import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PriceChart from './PriceChart';
import { QADisplay } from './QADisplay';
import { WebResearchCard } from './WebResearchCard';

interface MarketDetailsProps {
  description?: string;
  marketId: string;
  question: string;
}

export function MarketDetails({
  description,
  marketId,
  question
}: MarketDetailsProps) {
  const [selectedInterval, setSelectedInterval] = useState('1d');

  const { data: priceHistory, isLoading: isPriceLoading } = useQuery({
    queryKey: ['priceHistory', marketId, selectedInterval],
    queryFn: async () => {
      console.log('Fetching price history for market:', marketId);
      const response = await supabase.functions.invoke<{ t: string; y: number }[]>('price-history', {
        body: JSON.stringify({ marketId, interval: selectedInterval })
      });

      if (response.error) {
        console.error('Price history error:', response.error);
        throw response.error;
      }
      
      console.log('Price history response:', response.data);
      return response.data.map(point => ({
        time: new Date(point.t).getTime(),
        price: point.y * 100
      }));
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

  return (
    <div className="space-y-4">
      {/* Price History Section */}
      <div>
        <div className="text-sm text-muted-foreground mb-2">Price History</div>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : priceHistory && priceHistory.length > 0 ? (
          <PriceChart
            data={priceHistory}
            events={marketEvents || []}
            selectedInterval={selectedInterval}
            onIntervalSelect={setSelectedInterval}
          />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No price history available
          </div>
        )}
      </div>

      {/* Web Research Section */}
      {description && (
        <WebResearchCard 
          marketId={marketId}
          question={question}
          description={description}
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
    </div>
  );
}