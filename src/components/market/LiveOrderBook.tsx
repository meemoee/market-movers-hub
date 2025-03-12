
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
  isLoading: boolean;
  clobTokenId?: string;
  isClosing?: boolean;
}

export function LiveOrderBook({ onOrderBookData, isLoading, clobTokenId, isClosing }: LiveOrderBookProps) {
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Clear any existing error when closing
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, clearing error state');
      setError(null);
      return;
    }

    // Don't fetch if we don't have a token ID
    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided, not fetching orderbook data');
      return;
    }

    fetchOrderbookSnapshot(clobTokenId);
  }, [clobTokenId, isClosing, retryCount]);

  const fetchOrderbookSnapshot = async (tokenId: string) => {
    try {
      console.log('[LiveOrderBook] Fetching orderbook snapshot via WebSocket for token:', tokenId);
      setConnectionStatus("connecting");
      setError(null);

      // Call the Supabase Edge Function to get WebSocket snapshot
      const { data, error } = await supabase.functions.invoke('polymarket-ws', {
        body: { assetId: tokenId }
      });

      if (error) {
        console.error('[LiveOrderBook] Error fetching orderbook via WebSocket:', error);
        setConnectionStatus("error");
        setError(`Failed to fetch orderbook: ${error.message}`);
        return;
      }

      if (data && data.orderbook) {
        console.log('[LiveOrderBook] Received orderbook data from WebSocket:', data.orderbook);
        onOrderBookData(data.orderbook);
        setConnectionStatus("connected");
        setError(null);
      } else {
        console.error('[LiveOrderBook] No orderbook data received from WebSocket endpoint');
        setConnectionStatus("error");
        setError('No data received from WebSocket orderbook service');
      }
    } catch (err) {
      console.error('[LiveOrderBook] Error fetching orderbook data via WebSocket:', err);
      setConnectionStatus("error");
      setError('Failed to fetch orderbook data via WebSocket');
    }
  };

  if (isLoading && !isClosing) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">
          {connectionStatus === "connecting" ? "Connecting to orderbook..." : "Loading orderbook..."}
        </span>
      </div>
    );
  }

  if (error && !isClosing) {
    return (
      <div className="text-center text-red-500 py-4">
        <div className="mb-2">{error}</div>
        <button 
          onClick={() => {
            setRetryCount(prev => prev + 1);
          }}
          className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return null;
}
