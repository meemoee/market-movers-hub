
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RelatedMarketsProps {
  eventId: string;
  marketId: string;
  selectedInterval: string;
}

export function RelatedMarkets({ eventId, marketId, selectedInterval }: RelatedMarketsProps) {
  const { data: relatedMarkets, isLoading } = useQuery({
    queryKey: ['relatedMarkets', eventId, marketId, selectedInterval],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select(`
          id,
          question,
          yes_sub_title,
          market_prices (
            last_traded_price,
            timestamp
          )
        `)
        .eq('event_id', eventId)
        .neq('id', marketId);

      if (error) throw error;

      // For each market, get initial and final prices
      const marketsWithPriceChanges = await Promise.all(
        data.map(async (market) => {
          const { data: prices } = await supabase
            .from('market_prices')
            .select('last_traded_price, timestamp')
            .eq('market_id', market.id)
            .order('timestamp', { ascending: true });

          if (!prices?.length) return null;

          const initialPrice = prices[0]?.last_traded_price || 0;
          const finalPrice = prices[prices.length - 1]?.last_traded_price || 0;
          const priceChange = finalPrice - initialPrice;

          return {
            ...market,
            initialPrice,
            finalPrice,
            priceChange,
          };
        })
      );

      return marketsWithPriceChanges.filter(Boolean);
    },
    enabled: !!eventId && !!marketId,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 w-full bg-accent/20 rounded mb-2"></div>
        <div className="h-4 w-3/4 bg-accent/20 rounded"></div>
      </div>
    );
  }

  if (!relatedMarkets?.length) {
    return null;
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="text-sm text-muted-foreground mb-2">Related Markets</div>
      <div className="space-y-3">
        {relatedMarkets.map((market) => (
          <div key={market.id} className="flex items-center justify-between p-3 bg-accent/5 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{market.question}</div>
              {market.yes_sub_title && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {market.yes_sub_title}
                </div>
              )}
            </div>
            <div className={`text-sm font-medium ml-4 ${
              market.priceChange >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {(market.priceChange >= 0 ? '+' : '')}{(market.priceChange * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
