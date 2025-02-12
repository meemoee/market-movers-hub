import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HoverButton } from '@/components/ui/hover-button';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { TransactionDialog } from './TransactionDialog';
import { TrendingUp, TrendingDown } from "lucide-react";

interface RelatedMarketsProps {
  eventId: string;
  marketId: string;
  selectedInterval: string;
}

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export function RelatedMarkets({ eventId, marketId, selectedInterval }: RelatedMarketsProps) {
  const navigate = useNavigate();
  const [selectedMarket, setSelectedMarket] = useState<{ 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
    selectedOutcome: string;
  } | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isOrderBookLoading, setIsOrderBookLoading] = useState(false);

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
          outcomes,
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
          
          const totalVolume = prices.reduce((sum, price) => sum + (price.volume || 0), 0);
          const latestBid = prices[prices.length - 1]?.best_bid || 0;
          const latestAsk = prices[prices.length - 1]?.best_ask || 0;

          const clobtokenids = Array.isArray(market.clobtokenids) 
            ? market.clobtokenids.map(id => String(id))
            : [];
          const outcomes = Array.isArray(market.outcomes)
            ? market.outcomes.map(outcome => String(outcome))
            : [];

          return {
            ...market,
            initialPrice,
            finalPrice,
            priceChange,
            totalVolume,
            best_bid: latestBid,
            best_ask: latestAsk,
            clobtokenids,
            outcomes
          };
        })
      );

      return marketsWithPriceChanges
        .filter(Boolean)
        .sort((a, b) => (b?.finalPrice || 0) - (a?.finalPrice || 0));
    },
    enabled: !!eventId && !!marketId,
  });

  const handleTransaction = () => {
    if (!selectedMarket || !orderBookData) return;
    
    const action = selectedMarket.action;
    const price = action === 'buy' ? orderBookData.best_ask : orderBookData.best_bid;
    
    setSelectedMarket(null);
  };

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

  const selectedTopMover = selectedMarket 
    ? relatedMarkets?.find(m => m.id === selectedMarket.id)
    : null;

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="text-sm text-muted-foreground mb-2">Related Markets</div>
      <div className="space-y-4">
        {relatedMarkets.map((market) => (
          <div 
            key={market.id} 
            className="p-4 rounded-lg transition-colors bg-accent/10 cursor-pointer hover:bg-accent/20"
            onClick={() => navigate(`/market/${market.id}`)}
          >
            <div className="flex gap-4">
              {market.image && (
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                  <img 
                    src={market.image} 
                    alt={market.question}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium leading-snug line-clamp-2">
                      {market.question}
                    </div>
                    {market.yes_sub_title && (
                      <div className="text-sm mt-1 text-muted-foreground line-clamp-1">
                        {market.yes_sub_title}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <HoverButton
                      variant="buy"
                      onClick={() => {
                        const clobTokenId = market.clobtokenids?.[0];
                        if (clobTokenId) {
                          setSelectedMarket({ 
                            id: market.id, 
                            action: 'buy', 
                            clobTokenId,
                            selectedOutcome: "Yes"
                          });
                        }
                      }}
                      className="w-[70px] h-10 flex flex-col items-center justify-center"
                    >
                      <span className="text-xs">Yes</span>
                      <span className="text-[11px] font-medium opacity-90">
                        {(market.best_ask * 100).toFixed(1)}¢
                      </span>
                    </HoverButton>
                    <HoverButton
                      variant="sell"
                      onClick={() => {
                        const clobTokenId = market.clobtokenids?.[1];
                        if (clobTokenId) {
                          setSelectedMarket({ 
                            id: market.id, 
                            action: 'buy',
                            clobTokenId,
                            selectedOutcome: "No"
                          });
                        }
                      }}
                      className="w-[70px] h-10 flex flex-col items-center justify-center"
                    >
                      <span className="text-xs">No</span>
                      <span className="text-[11px] font-medium opacity-90">
                        {((1 - market.best_bid) * 100).toFixed(1)}¢
                      </span>
                    </HoverButton>
                  </div>
                </div>

                <div className="flex items-start justify-between mt-3">
                  <div className="flex flex-col">
                    <div className="text-3xl font-bold tracking-tight">
                      {(market.finalPrice * 100).toFixed(1)}%
                    </div>
                    <div className={`text-sm font-medium flex items-center gap-1
                      ${market.priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {market.priceChange >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {(market.priceChange * 100).toFixed(1)} pp
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-xl font-semibold">
                      ${market.totalVolume?.toFixed(0) || '0'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      24h Volume
                    </div>
                  </div>
                </div>
                
                <div className="relative h-[3px] w-full mt-3 mb-0">
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
              </div>
            </div>
          </div>
        ))}
      </div>

      <TransactionDialog
        selectedMarket={selectedMarket}
        topMover={selectedTopMover ? {
          market_id: selectedTopMover.id,
          question: selectedTopMover.question,
          image: selectedTopMover.image || '',
          clobtokenids: Array.isArray(selectedTopMover.clobtokenids) 
            ? selectedTopMover.clobtokenids.map(id => String(id))
            : [],
          outcomes: Array.isArray(selectedTopMover.outcomes) 
            ? selectedTopMover.outcomes.map(outcome => String(outcome))
            : [],
          selectedOutcome: selectedMarket?.selectedOutcome || ""
        } : null}
        onClose={() => setSelectedMarket(null)}
        orderBookData={orderBookData}
        isOrderBookLoading={isOrderBookLoading}
        onOrderBookData={(data) => {
          setOrderBookData(data);
          setIsOrderBookLoading(false);
        }}
        onConfirm={handleTransaction}
      />
    </div>
  );
}
