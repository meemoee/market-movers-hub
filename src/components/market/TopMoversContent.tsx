
import { Loader2 } from 'lucide-react';
import { MarketCard } from './MarketCard';
import type { TopMover } from '../TopMoversList';

interface TopMoversContentProps {
  isLoading: boolean;
  movers: TopMover[];
}

export function TopMoversContent({
  isLoading,
  movers
}: TopMoversContentProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (movers.length === 0) {
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
    <div className="w-full">
      <div className="w-full space-y-3">
        {movers.map((mover) => (
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
                description: mover.description,
                outcomes: mover.outcomes || ["Yes", "No"],
                event_id: mover.event_id,
              }}
              isExpanded={false}
              onToggleExpand={() => {}}
              onBuy={() => {}}
              onSell={() => {}}
              selectedInterval="1440"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

