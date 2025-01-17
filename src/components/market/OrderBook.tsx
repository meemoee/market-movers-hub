import { useEffect, useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface OrderBookProps {
  marketId: string;
}

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export function OrderBook({ marketId }: OrderBookProps) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial fetch
    const fetchOrderBook = async () => {
      const { data, error } = await supabase
        .from('orderbook_data')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setOrderBook(data);
      }
      setLoading(false);
    };

    fetchOrderBook();

    // Subscribe to changes
    const channel = supabase
      .channel('orderbook-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orderbook_data',
          filter: `market_id=eq.${marketId}`
        },
        (payload) => {
          console.log('Received orderbook update:', payload);
          if (payload.new) {
            setOrderBook(payload.new as OrderBookData);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [marketId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!orderBook) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No orderbook data available
      </div>
    );
  }

  const formatPrice = (price: number) => `${(price * 100).toFixed(2)}¢`;
  const formatSize = (size: number) => size.toFixed(2);

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-card/50 rounded-lg">
      <div>
        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Bids</h4>
        <div className="space-y-1">
          {Object.entries(orderBook.bids)
            .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
            .slice(0, 5)
            .map(([price, size]) => (
              <div key={price} className="flex justify-between text-sm">
                <span className="text-green-500">{formatPrice(parseFloat(price))}</span>
                <span>{formatSize(size)}</span>
              </div>
            ))}
        </div>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Asks</h4>
        <div className="space-y-1">
          {Object.entries(orderBook.asks)
            .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
            .slice(0, 5)
            .map(([price, size]) => (
              <div key={price} className="flex justify-between text-sm">
                <span className="text-red-500">{formatPrice(parseFloat(price))}</span>
                <span>{formatSize(size)}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="col-span-2 mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Best Bid</p>
            <p className="font-medium text-green-500">
              {formatPrice(orderBook.best_bid)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Best Ask</p>
            <p className="font-medium text-red-500">
              {formatPrice(orderBook.best_ask)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Spread</p>
            <p className="font-medium">
              {formatPrice(orderBook.spread)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}