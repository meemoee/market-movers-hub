
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
          image,
          market_prices (
            last_traded_price,
            timestamp,
            volume
          )
        `)
        .eq('event_id', eventId)
        .neq('id', marketId);

      if (error) throw error;

      // For each market, get initial and final prices, and total volume
      const marketsWithPriceChanges = await Promise.all(
        data.map(async (market) => {
          const { data: prices } = await supabase
            .from('market_prices')
            .select('last_traded_price, timestamp, volume')
            .eq('market_id', market.id)
            .order('timestamp', { ascending: true });

          if (!prices?.length) return null;

          const initialPrice = prices[0]?.last_traded_price || 0;
          const finalPrice = prices[prices.length - 1]?.last_traded_price || 0;
          const priceChange = finalPrice - initialPrice;
          
          // Calculate total volume
          const totalVolume = prices.reduce((sum, price) => sum + (price.volume || 0), 0);

          return {
            ...market,
            initialPrice,
            finalPrice,
            priceChange,
            totalVolume
          };
        })
      );

      return marketsWithPriceChanges.filter(Boolean);
    },
    enabled: !!eventId && !!marketId,
  });

  // Function to get background and text colors based on price change
  const getColors = (priceChange: number) => {
    const normalizedChange = Math.max(0, Math.min(1, priceChange)); // Clamp between 0 and 1
    
    if (normalizedChange > 0.66) {
      return {
        bg: 'bg-[#F2FCE2]',
        text: 'text-[#221F26]', // Dark text for light background
        muted: 'text-[#403E43]' // Darker muted text for light background
      };
    } else if (normalizedChange > 0.33) {
      return {
        bg: 'bg-[#FEF7CD]',
        text: 'text-[#221F26]',
        muted: 'text-[#403E43]'
      };
    } else if (normalizedChange > 0) {
      return {
        bg: 'bg-[#FDE1D3]',
        text: 'text-[#221F26]',
        muted: 'text-[#403E43]'
      };
    } else {
      return {
        bg: 'bg-[#FFDEE2]',
        text: 'text-[#221F26]',
        muted: 'text-[#403E43]'
      };
    }
  };

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
        {relatedMarkets.map((market) => {
          const colors = getColors(market.priceChange);
          return (
            <div 
              key={market.id} 
              className={`flex items-center justify-between p-3 rounded-lg transition-colors ${colors.bg}`}
            >
              <div className="flex items-center flex-1 min-w-0 gap-3">
                {market.image && (
                  <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                    <img 
                      src={market.image} 
                      alt={market.question}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${colors.text}`}>
                    {market.question}
                  </div>
                  {market.yes_sub_title && (
                    <div className={`text-xs truncate mt-0.5 ${colors.muted}`}>
                      {market.yes_sub_title}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end ml-4">
                <div className={`text-sm font-medium ${
                  market.priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {(market.priceChange >= 0 ? '+' : '')}{(market.priceChange * 100).toFixed(1)}%
                </div>
                <div className={`text-xs ${colors.muted}`}>
                  Vol: {market.totalVolume?.toFixed(2) || '0'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
