
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarketCard } from '@/components/market/MarketCard';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function MarketPage() {
  const { marketId } = useParams();
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [expandedMarkets] = useState(new Set([marketId])); // Always expanded

  const { data: market, isLoading } = useQuery({
    queryKey: ['market', marketId],
    queryFn: async () => {
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .select(`
          *,
          market_prices (
            last_traded_price,
            timestamp,
            volume,
            best_bid,
            best_ask
          )
        `)
        .eq('id', marketId)
        .single();

      if (marketError) throw marketError;

      // Get price history for market
      const { data: prices } = await supabase
        .from('market_prices')
        .select('last_traded_price, timestamp, volume, best_bid, best_ask')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: true });

      if (!prices?.length) return null;

      const initialPrice = prices[0]?.last_traded_price || 0;
      const finalPrice = prices[prices.length - 1]?.last_traded_price || 0;
      const priceChange = finalPrice - initialPrice;
      
      const totalVolume = prices.reduce((sum, price) => sum + (price.volume || 0), 0);
      const latestBid = prices[prices.length - 1]?.best_bid || 0;
      const latestAsk = prices[prices.length - 1]?.best_ask || 0;

      // Ensure outcomes is always an array of strings
      const outcomes = Array.isArray(marketData.outcomes) 
        ? marketData.outcomes as string[]
        : ["Yes", "No"];

      return {
        market_id: marketData.id,
        question: marketData.question,
        price: finalPrice,
        price_change: priceChange,
        volume: totalVolume,
        image: marketData.image || '/placeholder.svg',
        yes_sub_title: marketData.yes_sub_title,
        final_last_traded_price: finalPrice,
        final_best_ask: latestAsk,
        final_best_bid: latestBid,
        description: marketData.description || '',
        outcomes: outcomes,
        event_id: marketData.event_id,
      };
    },
    enabled: !!marketId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-medium">Market not found</h2>
          <p className="text-muted-foreground mt-2">The market you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <MarketCard
        market={market}
        isExpanded={expandedMarkets.has(marketId)}
        onToggleExpand={() => {}}
        onBuy={() => {}}
        onSell={() => {}}
        selectedInterval={selectedInterval}
      />
    </div>
  );
}
