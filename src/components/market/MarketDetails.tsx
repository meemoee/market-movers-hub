interface MarketDetailsProps {
  description?: string;
  bestBid: number;
  bestAsk: number;
  marketId: string;
}

import { OrderBook } from "./OrderBook";

export function MarketDetails({ description, bestBid, bestAsk, marketId }: MarketDetailsProps) {
  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}%`;
  };

  return (
    <div className="pt-4 border-t border-border space-y-4">
      {description && (
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-sm text-muted-foreground mb-1">Best Bid</div>
          <div className="text-lg font-medium text-green-500">
            {formatPrice(bestBid)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">Best Ask</div>
          <div className="text-lg font-medium text-red-500">
            {formatPrice(bestAsk)}
          </div>
        </div>
      </div>
      
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Live Order Book</h3>
        <OrderBook marketId={marketId} />
      </div>
    </div>
  );
}