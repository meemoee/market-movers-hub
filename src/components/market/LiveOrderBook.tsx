import { useEffect, useState } from 'react';
import { Loader2 } from "lucide-react";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface LiveOrderBookProps {
  onOrderBookData: (data: OrderBookData | null) => void;
  isLoading: boolean;
  clobTokenId?: string;
}

export function LiveOrderBook({ onOrderBookData, isLoading, clobTokenId }: LiveOrderBookProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clobTokenId) {
      console.log('No CLOB token ID provided');
      return;
    }

    let ws: WebSocket | null = null;

    const connectWebSocket = async () => {
      try {
        const wsUrl = 'wss://lfmkoismabbhujycnqpn.supabase.co/functions/v1/polymarket-ws';
        console.log('Connecting to WebSocket:', wsUrl);
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setError(null);
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
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
        };

      } catch (err) {
        console.error('Error setting up WebSocket:', err);
        setError('Failed to connect to orderbook service');
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        console.log('Closing WebSocket connection');
        ws.close();
      }
    };
  }, [onOrderBookData, clobTokenId]);

  if (isLoading) {
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