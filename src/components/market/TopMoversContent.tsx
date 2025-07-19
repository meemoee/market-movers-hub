
import { Loader2 } from 'lucide-react';
import { MarketCard } from './MarketCard';
import { TopMover } from '../TopMoversList';
import { useIsMobile } from '@/hooks/use-mobile';

interface TopMoversContentProps {
  isLoading: boolean;
  error: string | null;
  topMovers: TopMover[];
  expandedMarkets: Set<string>;
  toggleMarket: (marketId: string) => void;
  setSelectedMarket: (market: { 
    id: string; 
    action: 'buy' | 'sell'; 
    clobTokenId: string;
    selectedOutcome: string;
  } | null) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore?: boolean;
  selectedInterval: string;
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
  selectedInterval,
}: TopMoversContentProps) {
  const isMobile = useIsMobile();

  if (isLoading || (topMovers.length === 0 && isLoadingMore)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        {error}
      </div>
    );
  }

  if (topMovers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
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
    <div className={`w-full ${isMobile ? 'max-w-[100%] overflow-hidden' : ''}`}>
      <div className="w-full space-y-3">
        {topMovers.map((mover) => (
          <div key={mover.market_id} className="w-full first:mt-0">
            <MarketCard
              market={{
                market_id: mover.market_id,
                question: mover.question,
                price: mover.final_last_traded_price,
                price_change: mover.price_change,
                volume: mover.volume_change,
                total_volume: mover.final_volume,
                image: mover.image || '/placeholder.svg',
                yes_sub_title: mover.yes_sub_title,
                final_last_traded_price: mover.final_last_traded_price,
                final_best_ask: mover.final_best_ask,
                final_best_bid: mover.final_best_bid,
                final_no_best_ask: mover.final_no_best_ask,
                final_no_best_bid: mover.final_no_best_bid,
                description: mover.description,
                outcomes: mover.outcomes || ["Yes", "No"],
                event_id: mover.event_id,
              }}
              isExpanded={expandedMarkets.has(mover.market_id)}
              onToggleExpand={() => toggleMarket(mover.market_id)}
              onBuy={() => {
                const clobTokenId = mover.clobtokenids?.[0];
                if (clobTokenId) {
                  setSelectedMarket({ 
                    id: mover.market_id, 
                    action: 'buy', 
                    clobTokenId,
                    selectedOutcome: "Yes"
                  });
                }
              }}
              onSell={() => {
                const clobTokenId = mover.clobtokenids?.[1];
                if (clobTokenId) {
                  setSelectedMarket({ 
                    id: mover.market_id, 
                    action: 'buy',
                    clobTokenId,
                    selectedOutcome: "No"
                  });
                }
              }}
              selectedInterval={selectedInterval}
            />
          </div>
        ))}
      </div>

      {hasMore && (
        <div className={`mt-3 ${isMobile ? 'h-[48px] px-2' : 'h-[52px]'}`}>
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
        </div>
      )}
    </div>
  );
}
