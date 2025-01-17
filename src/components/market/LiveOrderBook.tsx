import { useEffect, useState } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    let ws: WebSocket | null = null;

    const connectWebSocket = async () => {
      try {
        const { data: { publicUrl } } = await supabase.storage.from('').getPublicUrl('');
        const baseUrl = publicUrl.split('/storage/v1')[0];
        const wsUrl = `${baseUrl}/functions/v1/polymarket-ws`.replace('https://', 'wss://');
        console.log('Connecting to WebSocket:', wsUrl);
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setLoading(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received orderbook update:', data);
            if (data.orderbook) {
              onOrderBookData(data.orderbook);
              setError(null);
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
            setError('Failed to parse orderbook data');
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setError('WebSocket connection error');
          setLoading(false);
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          setLoading(false);
        };

      } catch (err) {
        console.error('Error setting up WebSocket:', err);
        setError('Failed to connect to orderbook service');
        setLoading(false);
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        console.log('Closing WebSocket connection');
        ws.close();
      }
    };
  }, [onOrderBookData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Connecting to orderbook...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500">{error}</div>
    );
  }

  return null;
}