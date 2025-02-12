
import { useEffect, useState, useCallback } from 'react';
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
  const [ws, setWs] = useState<WebSocket | null>(null);

  const cleanup = useCallback(() => {
    if (ws) {
      console.log('Cleaning up WebSocket connection');
      ws.close();
      setWs(null);
    }
  }, [ws]);

  useEffect(() => {
    // Clear orderbook data and cleanup existing connection
    onOrderBookData(null);
    cleanup();
    
    if (!clobTokenId) {
      console.log('No CLOB token ID provided');
      return;
    }

    const wsUrl = `wss://lfmkoismabbhujycnqpn.supabase.co/functions/v1/polymarket-ws?assetId=${clobTokenId}`;
    console.log('Connecting to WebSocket:', wsUrl);
    
    const newWs = new WebSocket(wsUrl);
    setWs(newWs);

    newWs.onopen = () => {
      console.log('WebSocket connected');
      setError(null);
    };

    newWs.onmessage = (event) => {
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

    newWs.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('WebSocket connection error');
    };

    newWs.onclose = () => {
      console.log('WebSocket closed');
      setWs(null);
    };

    // Cleanup function
    return () => {
      console.log('Component cleanup - closing WebSocket');
      cleanup();
      onOrderBookData(null);
    };
  }, [clobTokenId, onOrderBookData, cleanup]); // Added cleanup to dependencies

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
