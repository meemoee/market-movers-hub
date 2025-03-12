
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

    fetchInitialOrderbookData(clobTokenId);
  }, [clobTokenId, isClosing, retryCount]);

  const fetchInitialOrderbookData = async (tokenId: string) => {
    try {
      console.log('[LiveOrderBook] Fetching initial orderbook data for token:', tokenId);
      setConnectionStatus("connecting");
      setError(null);

      // Call the Supabase Edge Function to get initial data only
      const { data, error } = await supabase.functions.invoke('get-orderbook', {
        body: { tokenId }
      });

      if (error) {
        console.error('[LiveOrderBook] Error fetching orderbook data:', error);
        setConnectionStatus("error");
        setError(`Failed to fetch orderbook data: ${error.message}`);
        return;
      }

      if (data) {
        console.log('[LiveOrderBook] Received orderbook data:', data);
        
        // Handle both direct response and response from WebSocket endpoint
        const orderbookData = data.orderbook ? data.orderbook : data;
        
        onOrderBookData(orderbookData);
        setConnectionStatus("connected");
        setError(null);
      } else {
        console.error('[LiveOrderBook] No data received from orderbook endpoint');
        setConnectionStatus("error");
        setError('No data received from orderbook service');
      }
    } catch (err) {
      console.error('[LiveOrderBook] Error fetching orderbook data:', err);
      setConnectionStatus("error");
      setError('Failed to fetch orderbook data');
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
