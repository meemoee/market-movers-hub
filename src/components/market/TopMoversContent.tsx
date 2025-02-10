
import { Loader2 } from 'lucide-react';
import { MarketCard } from './MarketCard';
import { TopMover } from '../TopMoversList';
import { useRef, useEffect, useState } from 'react';

interface TopMoversContentProps {
  isLoading: boolean;
  error: string | null;
  topMovers: TopMover[];
  expandedMarkets: Set<string>;
  toggleMarket: (marketId: string) => void;
  setSelectedMarket: (market: { id: string; action: 'buy' | 'sell'; clobTokenId: string; } | null) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore?: boolean;
}

export function TopMoversContent({
  isLoading,
  error,
  topMovers,
  expandedMarkets,
  toggleMarket,
  setSelectedMarket,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: TopMoversContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(500);
  
  // Update container height when content changes
  useEffect(() => {
    if (containerRef.current && !isLoading && !isLoadingMore) {
      setContainerHeight(Math.max(500, containerRef.current.scrollHeight));
    }
  }, [topMovers, isLoading, isLoadingMore]);

  // Check if this is the initial load with no data
  const isInitialLoading = isLoading && !isLoadingMore && topMovers.length === 0;
  
  // Only show the initial loading state when we have no data
  if (isInitialLoading) {
    return (
      <div style={{ height: containerHeight }} className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: containerHeight }} className="flex items-center justify-center text-destructive">
        {error}
      </div>
    );
  }

  // Only show no markets message if we're not loading and truly have no data
  if (!isLoading && !isLoadingMore && topMovers.length === 0) {
    return (
      <div style={{ height: containerHeight }} className="flex flex-col items-center justify-center space-y-4">
        <p className="text-lg text-muted-foreground">
          No market movers found for the selected time period
        </p>
        <p className="text-sm text-muted-foreground">
          Try selecting a different time interval or check back later
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: containerHeight }} className="w-full">
      <div className="space-y-3">
        {topMovers.map((mover) => (
          <div key={mover.market_id}>
            <MarketCard
              market={{
                market_id: mover.market_id,
                question: mover.question,
                price: mover.final_last_traded_price,
                price_change: mover.price_change,
                volume: mover.final_volume,
                image: mover.image || '/placeholder.svg',
                yes_sub_title: mover.yes_sub_title,
                final_last_traded_price: mover.final_last_traded_price,
                final_best_ask: mover.final_best_ask,
                final_best_bid: mover.final_best_bid,
                description: mover.description,
                outcomes: mover.outcomes || ["Yes", "No"],
              }}
              isExpanded={expandedMarkets.has(mover.market_id)}
              onToggleExpand={() => toggleMarket(mover.market_id)}
              onBuy={() => {
                const clobTokenId = mover.clobtokenids?.[0];
                if (clobTokenId) {
                  setSelectedMarket({ 
                    id: mover.market_id, 
                    action: 'buy', 
                    clobTokenId 
                  });
                }
              }}
              onSell={() => {
                const clobTokenId = mover.clobtokenids?.[1];
                if (clobTokenId) {
                  setSelectedMarket({ 
                    id: mover.market_id, 
                    action: 'buy',  // Changed to 'buy' since we're buying the opposite outcome
                    clobTokenId 
                  });
                }
              }}
            />
          </div>
        ))}
      </div>

      <div className="h-16 flex items-center justify-center mt-3">
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full py-3 bg-accent/50 hover:bg-accent/70 rounded-lg transition-colors
              flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load More'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
