import { useEffect, useState } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OrderBookDisplay } from './OrderBookDisplay';

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface LiveOrderBookProps {
  onOrderBookData: (data: OrderBookData | null) => void;
}

export function LiveOrderBook({ onOrderBookData }: LiveOrderBookProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
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
          setOrderBookData(data.orderbook);
          onOrderBookData(data.orderbook);
        } else {
          setError('No orderbook data available');
          onOrderBookData(null);
        }
      } catch (err) {
        console.error('Error fetching orderbook:', err);
        setError('Failed to fetch orderbook data');
        onOrderBookData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();
  }, [onOrderBookData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading orderbook...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500">{error}</div>
    );
  }

  if (!orderBookData) {
    return null;
  }

  return <OrderBookDisplay {...orderBookData} />;
}