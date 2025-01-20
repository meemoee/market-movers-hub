import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PriceChart from './PriceChart';

interface MarketDetailsProps {
  bestBid: number;
  bestAsk: number;
  description?: string;
  marketId: string;
}

export function MarketDetails({
  bestBid,
  bestAsk,
  description,
  marketId,
}: MarketDetailsProps) {
  const [selectedInterval, setSelectedInterval] = useState('1d');

  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ['priceHistory', marketId, selectedInterval],
    queryFn: async () => {
      const response = await supabase.functions.invoke<{ t: string; y: number }[]>('price-history', {
        body: { marketId, interval: selectedInterval }
      });

      if (response.error) throw response.error;
      return response.data.map(point => ({
        time: new Date(point.t).getTime(),
        price: point.y * 100 // Convert to percentage
      }));
    },
    enabled: !!marketId
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Best Bid</div>
          <div className="text-lg font-semibold">{(bestBid * 100).toFixed(2)}¢</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Best Ask</div>
          <div className="text-lg font-semibold">{(bestAsk * 100).toFixed(2)}¢</div>
        </div>
      </div>

      {description && (
        <div>
          <div className="text-sm text-muted-foreground mb-1">Description</div>
          <div className="text-sm">{description}</div>
        </div>
      )}

      <div>
        <div className="text-sm text-muted-foreground mb-2">Price History</div>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : priceHistory && priceHistory.length > 0 ? (
          <PriceChart
            data={priceHistory}
            selectedInterval={selectedInterval}
            onIntervalSelect={setSelectedInterval}
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