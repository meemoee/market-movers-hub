
import { useEffect, useState, useRef } from 'react';
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
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const currentMarketRef = useRef<string | null>(null);

  useEffect(() => {
    // Track the current market ID to validate incoming data
    currentMarketRef.current = clobTokenId || null;
    
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, clearing state and subscriptions');
      setError(null);
      if (subscriptionRef.current) {
        console.log('[LiveOrderBook] Unsubscribing from channel');
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      // Signal to parent that orderbook data should be cleared
      onOrderBookData(null);
      return;
    }

    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided');
      return;
    }

    // Clear any previous data when switching markets
    onOrderBookData(null);

    // Trigger initial fetch to populate data and establish WebSocket connection
    fetchOrderbookSnapshot(clobTokenId);

    // Create a unique channel name per market ID
    const channelName = `orderbook-updates-${clobTokenId}`;
    console.log(`[LiveOrderBook] Creating new channel: ${channelName} for market ${clobTokenId}`);

    // Set up realtime subscription with unique channel name
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orderbook_data',
          filter: `market_id=eq.${clobTokenId}`,
        },
        (payload) => {
          console.log('[LiveOrderBook] Received realtime update:', payload);
          
          // Only process updates for the current market
          if (currentMarketRef.current !== clobTokenId) {
            console.log('[LiveOrderBook] Ignoring update for different market', {
              current: currentMarketRef.current,
              received: clobTokenId
            });
            return;
          }
          
          if (payload.new) {
            const newData = payload.new as any;
            // Validate that the update is for the current market
            if (newData.market_id === clobTokenId) {
              const orderbookData: OrderBookData = {
                bids: newData.bids || {},
                asks: newData.asks || {},
                best_bid: newData.best_bid,
                best_ask: newData.best_ask,
                spread: newData.spread,
              };
              onOrderBookData(orderbookData);
              setConnectionStatus("connected");
              setError(null);
            } else {
              console.warn('[LiveOrderBook] Received update for wrong market', {
                expected: clobTokenId,
                received: newData.market_id
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`[LiveOrderBook] Subscription status for ${channelName}:`, status);
        if (status === 'SUBSCRIBED') {
          console.log(`[LiveOrderBook] Successfully subscribed to realtime updates for ${clobTokenId}`);
        }
      });

    // Store the subscription reference
    subscriptionRef.current = channel;

    return () => {
      console.log(`[LiveOrderBook] Cleaning up subscription for ${clobTokenId}`);
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      // Clear the current market reference
      currentMarketRef.current = null;
    };
  }, [clobTokenId, isClosing, retryCount, onOrderBookData]);

  const fetchOrderbookSnapshot = async (tokenId: string) => {
    try {
      console.log('[LiveOrderBook] Fetching orderbook snapshot for token:', tokenId);
      setConnectionStatus("connecting");
      setError(null);

      const { data, error } = await supabase.functions.invoke('polymarket-ws', {
        body: { assetId: tokenId }
      });

      // Verify we're still looking at the same market
      if (currentMarketRef.current !== tokenId) {
        console.log('[LiveOrderBook] Market changed during fetch, aborting update');
        return;
      }

      if (error) {
        console.error('[LiveOrderBook] Error fetching orderbook:', error);
        setConnectionStatus("error");
        setError(`Failed to fetch orderbook: ${error.message}`);
        return;
      }

      if (data && data.orderbook) {
        console.log('[LiveOrderBook] Received orderbook data:', data.orderbook);
        onOrderBookData(data.orderbook);
        setConnectionStatus("connected");
        setError(null);
      } else {
        console.error('[LiveOrderBook] No orderbook data received');
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
