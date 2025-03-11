import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HoverButton } from '@/components/ui/hover-button';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { TransactionDialog } from './TransactionDialog';
import { TrendingUp, TrendingDown, SortAsc } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface RelatedMarketsProps {
  eventId: string;
  marketId: string;
  selectedInterval: string;
}

// Helper function to clean text fields
function cleanTextFields(market: any) {
  const fieldsToClean = ['question', 'subtitle', 'yes_sub_title', 'no_sub_title', 'description'];
  
  fieldsToClean.forEach(field => {
    if (market[field]) {
      // Replace multiple apostrophes with a single one
      market[field] = market[field].replace(/'{2,}/g, "'");
    }
  });
  
  return market;
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
  const [sortBy, setSortBy] = useState<'priceChange' | 'likelihood'>('priceChange');

  const { data: relatedMarkets, isLoading } = useQuery({
    queryKey: ['relatedMarkets', eventId, marketId, selectedInterval, sortBy],
    queryFn: async () => {
      const { data: markets, error } = await supabase
        .from('markets')
        .select(`
          id,
          question,
          yes_sub_title,
          image,
          clobtokenids,
          outcomes,
          event_id
        `)
        .eq('event_id', eventId)
        .neq('id', marketId);

      if (error) throw error;

      const { data: topMoversData, error: topMoversError } = await supabase.functions.invoke<{
        data: Array<{
          market_id: string;
          final_last_traded_price: number;
          final_best_ask: number;
          final_best_bid: number;
          final_volume: number;
          volume_change: number;
          price_change: number;
        }>;
      }>('get-top-movers', {
        body: { 
          marketIds: markets.map(m => m.id),
          interval: selectedInterval
        }
      });

      if (topMoversError) throw topMoversError;

      const marketsWithPriceChanges = markets.map(market => {
        const moverData = topMoversData?.data?.find(m => m.market_id === market.id);
        if (!moverData) return null;

        const clobtokenids = Array.isArray(market.clobtokenids) 
          ? market.clobtokenids.map(id => String(id))
          : [];
        const outcomes = Array.isArray(market.outcomes)
          ? market.outcomes.map(outcome => String(outcome))
          : [];

        // Clean text fields before returning
        const cleanedMarket = cleanTextFields({
          ...market,
          finalPrice: moverData.final_last_traded_price,
          priceChange: moverData.price_change,
          totalVolume: moverData.final_volume,
          volume_change: moverData.volume_change,
          best_bid: moverData.final_best_bid,
          best_ask: moverData.final_best_ask,
          clobtokenids,
          outcomes
        });

        return cleanedMarket;
      });

      const filteredMarkets = marketsWithPriceChanges.filter(Boolean);
      
      return filteredMarkets.sort((a, b) => {
        if (sortBy === 'priceChange') {
          return Math.abs((b?.priceChange || 0)) - Math.abs((a?.priceChange || 0));
        } else {
          return (b?.finalPrice || 0) - (a?.finalPrice || 0);
        }
      });
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
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-muted-foreground">Related Markets</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <SortAsc className="h-4 w-4" />
              Sort by {sortBy === 'priceChange' ? 'Price Change' : 'Likelihood'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuItem onClick={() => setSortBy('priceChange')}>
              Price Change
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('likelihood')}>
              Likelihood
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="max-h-[600px] overflow-y-auto pr-2 -mr-2 space-y-4">
        {relatedMarkets.map((market) => (
          <div 
            key={market.id} 
            className="p-4 rounded-lg transition-all duration-200 bg-accent/10 cursor-pointer hover:bg-accent/20 hover:scale-[1.01] hover:shadow-lg"
            onClick={() => navigate(`/market/${market.id}`)}
          >
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                {market.image && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                    <img 
                      src={market.image} 
                      alt={market.question}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 h-12">
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-medium leading-snug line-clamp-2">
                        {market.question}
                      </div>
                      {market.yes_sub_title && (
                        <div className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
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
                </div>
              </div>

              <div className="flex items-start justify-between">
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
                    ${Math.abs(market.volume_change)?.toFixed(0) || '0'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${market.totalVolume?.toFixed(0) || '0'} Total
                  </div>
                </div>
              </div>
              
              <div className="relative h-[3px] w-full">
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
