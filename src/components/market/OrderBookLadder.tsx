import { Loader2 } from "lucide-react";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface OrderBookLadderProps {
  orderBookData: OrderBookData | null;
  isLoading: boolean;
  maxRows?: number;
}

interface LadderRow {
  price: number;
  bidSize: number;
  askSize: number;
  isBestBid: boolean;
  isBestAsk: boolean;
}

export function OrderBookLadder({ 
  orderBookData, 
  isLoading, 
  maxRows = 10 
}: OrderBookLadderProps) {
  console.log('[OrderBookLadder] Rendering with data:', orderBookData);

  const generateLadderRows = (): LadderRow[] => {
    if (!orderBookData) return [];

    const bids = orderBookData.bids || {};
    const asks = orderBookData.asks || {};
    
    // Get all unique prices and sort them
    const allPrices = new Set([
      ...Object.keys(bids).map(Number),
      ...Object.keys(asks).map(Number)
    ]);
    
    const sortedPrices = Array.from(allPrices).sort((a, b) => b - a); // Descending order
    
    // Create ladder rows with proper price centering around best bid/ask
    const bestBid = orderBookData.best_bid;
    const bestAsk = orderBookData.best_ask;
    const spread = orderBookData.spread;
    
    // Find the index of best bid and best ask
    const bestBidIndex = sortedPrices.findIndex(price => price === bestBid);
    const bestAskIndex = sortedPrices.findIndex(price => price === bestAsk);
    
    // Generate a focused view around the best prices
    const centerIndex = Math.max(bestBidIndex, bestAskIndex);
    const startIndex = Math.max(0, centerIndex - Math.floor(maxRows / 2));
    const endIndex = Math.min(sortedPrices.length, startIndex + maxRows);
    
    const visiblePrices = sortedPrices.slice(startIndex, endIndex);
    
    // If we don't have enough prices, generate some around the spread
    if (visiblePrices.length < maxRows && bestBid && bestAsk) {
      const spreadIncrement = spread / 10; // Create granular price levels
      const generatedPrices = new Set(visiblePrices);
      
      // Add prices between best bid and ask
      for (let i = 1; i < 10; i++) {
        const price = bestBid + (spreadIncrement * i);
        if (price < bestAsk) {
          generatedPrices.add(price);
        }
      }
      
      // Add some prices above best ask
      for (let i = 1; i <= 3; i++) {
        generatedPrices.add(bestAsk + (spreadIncrement * i));
      }
      
      // Add some prices below best bid
      for (let i = 1; i <= 3; i++) {
        const price = bestBid - (spreadIncrement * i);
        if (price > 0) {
          generatedPrices.add(price);
        }
      }
      
      const finalPrices = Array.from(generatedPrices)
        .sort((a, b) => b - a)
        .slice(0, maxRows);
      
      return finalPrices.map(price => ({
        price,
        bidSize: bids[price.toString()] || 0,
        askSize: asks[price.toString()] || 0,
        isBestBid: Math.abs(price - bestBid) < 0.0001,
        isBestAsk: Math.abs(price - bestAsk) < 0.0001
      }));
    }
    
    return visiblePrices.map(price => ({
      price,
      bidSize: bids[price.toString()] || 0,
      askSize: asks[price.toString()] || 0,
      isBestBid: Math.abs(price - bestBid) < 0.0001,
      isBestAsk: Math.abs(price - bestAsk) < 0.0001
    }));
  };

  const ladderRows = generateLadderRows();
  const formatPrice = (price: number) => `${(price * 100).toFixed(2)}¢`;
  const formatSize = (size: number) => size > 0 ? size.toFixed(2) : "--";

  if (isLoading) {
    return (
      <div className="bg-accent/20 p-4 rounded-lg">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading orderbook...</span>
        </div>
      </div>
    );
  }

  if (!orderBookData || ladderRows.length === 0) {
    return (
      <div className="bg-accent/20 p-4 rounded-lg">
        <div className="text-center py-8 text-muted-foreground text-sm">
          No orderbook data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-accent/20 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-5 gap-1 p-3 bg-accent/30 text-xs font-medium text-muted-foreground border-b border-border/50">
        <div className="text-right">Bid Size</div>
        <div className="text-right">Bid</div>
        <div className="text-center">Price</div>
        <div className="text-left">Ask</div>
        <div className="text-left">Ask Size</div>
      </div>
      
      {/* Ladder Rows */}
      <div className="space-y-0">
        {ladderRows.map((row, index) => (
          <div 
            key={`ladder-${row.price}-${index}`}
            className={`
              grid grid-cols-5 gap-1 px-3 py-1.5 text-sm transition-all duration-200 
              hover:bg-accent/40 border-b border-border/20 last:border-b-0
              ${row.isBestBid || row.isBestAsk ? 'bg-accent/40' : ''}
            `}
          >
            {/* Bid Size */}
            <div className={`
              text-right font-mono 
              ${row.bidSize > 0 ? 'text-green-400' : 'text-muted-foreground/50'}
              ${row.isBestBid ? 'font-semibold' : ''}
            `}>
              {formatSize(row.bidSize)}
            </div>
            
            {/* Bid Price */}
            <div className={`
              text-right font-mono 
              ${row.bidSize > 0 ? 'text-green-500' : 'text-muted-foreground/50'}
              ${row.isBestBid ? 'font-semibold bg-green-500/10 px-1 rounded' : ''}
            `}>
              {row.bidSize > 0 ? formatPrice(row.price) : "--"}
            </div>
            
            {/* Center Price */}
            <div className={`
              text-center font-mono font-medium 
              ${row.isBestBid ? 'text-green-500' : row.isBestAsk ? 'text-red-500' : 'text-foreground'}
              ${(row.isBestBid || row.isBestAsk) ? 'bg-accent/60 px-1 rounded' : ''}
            `}>
              {formatPrice(row.price)}
            </div>
            
            {/* Ask Price */}
            <div className={`
              text-left font-mono 
              ${row.askSize > 0 ? 'text-red-500' : 'text-muted-foreground/50'}
              ${row.isBestAsk ? 'font-semibold bg-red-500/10 px-1 rounded' : ''}
            `}>
              {row.askSize > 0 ? formatPrice(row.price) : "--"}
            </div>
            
            {/* Ask Size */}
            <div className={`
              text-left font-mono 
              ${row.askSize > 0 ? 'text-red-400' : 'text-muted-foreground/50'}
              ${row.isBestAsk ? 'font-semibold' : ''}
            `}>
              {formatSize(row.askSize)}
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer with spread */}
      <div className="p-3 bg-accent/30 border-t border-border/50">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-muted-foreground">Best Bid: </span>
              <span className="text-green-500 font-mono font-medium">
                {orderBookData.best_bid ? formatPrice(orderBookData.best_bid) : "--"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Best Ask: </span>
              <span className="text-red-500 font-mono font-medium">
                {orderBookData.best_ask ? formatPrice(orderBookData.best_ask) : "--"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Spread: </span>
            <span className="font-mono font-medium">
              {orderBookData.spread ? formatPrice(orderBookData.spread) : "--"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
