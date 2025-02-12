
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HoverButton } from '@/components/ui/hover-button';

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
          clobtokenids,
          market_prices (
            last_traded_price,
            timestamp,
            volume,
            best_bid,
            best_ask
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
            .select('last_traded_price, timestamp, volume, best_bid, best_ask')
            .eq('market_id', market.id)
            .order('timestamp', { ascending: true });

          if (!prices?.length) return null;

          const initialPrice = prices[0]?.last_traded_price || 0;
          const finalPrice = prices[prices.length - 1]?.last_traded_price || 0;
          const priceChange = finalPrice - initialPrice;
          
          // Calculate total volume and get latest bid/ask
          const totalVolume = prices.reduce((sum, price) => sum + (price.volume || 0), 0);
          const latestBid = prices[prices.length - 1]?.best_bid || 0;
          const latestAsk = prices[prices.length - 1]?.best_ask || 0;

          return {
            ...market,
            initialPrice,
            finalPrice,
            priceChange,
            totalVolume,
            best_bid: latestBid,
            best_ask: latestAsk
          };
        })
      );

      return marketsWithPriceChanges.filter(Boolean);
    },
    enabled: !!eventId && !!marketId,
  });

  const calculatePosition = (price: number): number => {
    return price * 100;
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
      <div className="space-y-4">
        {relatedMarkets.map((market) => (
          <div 
            key={market.id} 
            className="p-4 rounded-lg transition-colors bg-accent/10"
          >
            <div className="flex gap-4">
              {market.image && (
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <img 
                    src={market.image} 
                    alt={market.question}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1">
                <div className="text-base font-medium leading-snug">
                  {market.question}
                </div>
                {market.yes_sub_title && (
                  <div className="text-sm mt-2 text-muted-foreground">
                    {market.yes_sub_title}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      Vol: {market.totalVolume?.toFixed(2) || '0'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Last: {(market.finalPrice * 100).toFixed(1)}¢
                    </div>
                  </div>
                  <div className={`text-base font-medium ${
                    market.priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(market.priceChange >= 0 ? '+' : '')}{(market.priceChange * 100).toFixed(1)}%
                  </div>
                </div>
                
                {/* Price change visualization bar */}
                <div className="relative h-[3px] w-full mt-3 mb-3">
                  <div 
                    className="absolute bg-white/50 h-2 top-[-4px]" 
                    style={{ 
                      width: `${calculatePosition(market.finalPrice)}%`
                    }}
                  />
                  
                  {market.priceChange >= 0 ? (
                    <>
                      <div 
                        className="absolute bg-green-900/90 h-2 top-[-4px]" 
                        style={{ 
                          width: `${Math.abs(market.priceChange * 100)}%`,
                          right: `${100 - calculatePosition(market.finalPrice)}%`
                        }}
                      />
                      <div 
                        className="absolute h-3 w-0.5 bg-gray-400 top-[-6px]"
                        style={{ 
                          right: `${100 - calculatePosition(market.finalPrice)}%`
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <div 
                        className="absolute bg-red-500/50 h-2 top-[-4px]" 
                        style={{ 
                          width: `${Math.abs(market.priceChange * 100)}%`,
                          left: `${calculatePosition(market.finalPrice)}%`
                        }}
                      />
                      <div 
                        className="absolute h-3 w-0.5 bg-gray-400 top-[-6px]"
                        style={{ 
                          left: `${calculatePosition(market.finalPrice)}%`
                        }}
                      />
                    </>
                  )}
                </div>

                {/* Buy/Sell buttons */}
                <div className="flex gap-2 mt-3">
                  <HoverButton
                    variant="buy"
                    onClick={() => {}}
                    className="flex-1 h-12 flex flex-col items-center justify-center"
                  >
                    <span className="text-xs">Yes</span>
                    <span className="text-[11px] font-medium opacity-90">
                      {(market.best_ask * 100).toFixed(1)}¢
                    </span>
                  </HoverButton>
                  <HoverButton
                    variant="sell"
                    onClick={() => {}}
                    className="flex-1 h-12 flex flex-col items-center justify-center"
                  >
                    <span className="text-xs">No</span>
                    <span className="text-[11px] font-medium opacity-90">
                      {((1 - market.best_bid) * 100).toFixed(1)}¢
                    </span>
                  </HoverButton>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
