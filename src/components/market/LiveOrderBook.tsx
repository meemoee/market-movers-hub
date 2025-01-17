import { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export function LiveOrderBook() {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        // Use the Supabase client's URL directly
        const { data: { publicUrl } } = await supabase.storage.from('').getPublicUrl('');
        const baseUrl = publicUrl.split('/storage/v1')[0];
        const wsUrl = `${baseUrl}/functions/v1/polymarket-ws/test`;
        console.log('Fetching from:', wsUrl);
        
        const response = await fetch(wsUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.orderbook) {
          setOrderBook(data.orderbook);
        } else {
          setError('No orderbook data available');
        }
      } catch (err) {
        console.error('Error fetching orderbook:', err);
        setError('Failed to fetch orderbook data');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();
  }, []);

  const formatPrice = (price: number) => `${(price * 100).toFixed(2)}¢`;

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2">Loading orderbook...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-500">{error}</div>
      </Card>
    );
  }

  if (!orderBook) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">No orderbook data available</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Live Order Book</h2>
      
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Bids</h3>
          <div className="space-y-1">
            {Object.entries(orderBook.bids)
              .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
              .slice(0, 5)
              .map(([price, size]) => (
                <div key={price} className="flex justify-between text-sm">
                  <span className="text-green-500">{formatPrice(parseFloat(price))}</span>
                  <span>{size.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-2">Asks</h3>
          <div className="space-y-1">
            {Object.entries(orderBook.asks)
              .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
              .slice(0, 5)
              .map(([price, size]) => (
                <div key={price} className="flex justify-between text-sm">
                  <span className="text-red-500">{formatPrice(parseFloat(price))}</span>
                  <span>{size.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-border">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Best Bid</div>
            <div className="font-medium text-green-500">
              {formatPrice(orderBook.best_bid)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Best Ask</div>
            <div className="font-medium text-red-500">
              {formatPrice(orderBook.best_ask)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Spread</div>
            <div className="font-medium">
              {formatPrice(orderBook.spread)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}