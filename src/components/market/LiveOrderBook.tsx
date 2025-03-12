
import { useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useOrderBookRealtime } from '@/hooks/useOrderBookRealtime';
import { OrderBookData } from '@/hooks/useOrderBookRealtime';

interface LiveOrderBookProps {
  clobTokenId?: string;
  onOrderBookData: (data: OrderBookData | null) => void;
  isLoading: boolean;
  isClosing: boolean;
}

export function LiveOrderBook({
  clobTokenId,
  onOrderBookData,
  isLoading: externalLoading,
  isClosing
}: LiveOrderBookProps) {
  const { orderBookData, isLoading, error } = useOrderBookRealtime(
    isClosing ? undefined : clobTokenId
  );

  // Pass order book data up to parent component
  useEffect(() => {
    console.log('[LiveOrderBook] Passing orderbook data to parent:', orderBookData);
    onOrderBookData(orderBookData);
  }, [orderBookData, onOrderBookData]);

  if (!clobTokenId) {
    return (
      <div className="flex justify-center items-center p-4 h-16">
        <p className="text-muted-foreground text-sm">No market selected</p>
      </div>
    );
  }

  if (isLoading || externalLoading) {
    return (
      <div className="flex justify-center items-center p-4 h-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm">Connecting to orderbook...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center p-4 h-16 text-destructive">
        <AlertCircle className="h-5 w-5 mr-2" />
        <p className="text-sm">Error loading orderbook: {error.message}</p>
      </div>
    );
  }

  if (!orderBookData) {
    return (
      <div className="flex justify-center items-center p-4 h-16">
        <p className="text-muted-foreground text-sm">Waiting for orderbook data...</p>
      </div>
    );
  }

  return (
    <div className="p-2 h-16 bg-accent/10 rounded-lg flex items-center justify-center">
      <div className="flex items-center space-x-3">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Best Bid</div>
          <div className="text-sm font-medium text-green-500">
            {orderBookData.best_bid !== null ? `${(orderBookData.best_bid * 100).toFixed(2)}¢` : '-'}
          </div>
        </div>
        
        <div className="h-8 border-l border-border"></div>
        
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Spread</div>
          <div className="text-sm font-medium">
            {orderBookData.spread !== null ? `${(orderBookData.spread * 100).toFixed(2)}¢` : '-'}
          </div>
        </div>
        
        <div className="h-8 border-l border-border"></div>
        
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Best Ask</div>
          <div className="text-sm font-medium text-red-500">
            {orderBookData.best_ask !== null ? `${(orderBookData.best_ask * 100).toFixed(2)}¢` : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
