interface MarketDetailsProps {
  description?: string;
  bestBid: number;
  bestAsk: number;
  marketId: string;
}

export function MarketDetails({ description, bestBid, bestAsk }: MarketDetailsProps) {
  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}¢`;
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
          <div className="text-lg font-medium">
            {formatPrice(bestBid)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">Best Ask</div>
          <div className="text-lg font-medium">
            {formatPrice(bestAsk)}
          </div>
        </div>
      </div>
    </div>
  );
}