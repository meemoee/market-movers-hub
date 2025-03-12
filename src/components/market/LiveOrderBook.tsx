
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

// Add an interface for the Supabase realtime payload
interface OrderbookPayload {
  market_id: string;
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
  const [orderbookData, setOrderbookData] = useState<OrderBookData | null>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const currentMarketRef = useRef<string | null>(null);
  const instanceIdRef = useRef<string>(`orderbook-${Math.random().toString(36).substring(2, 11)}`);
  
  // Debounce orderbook updates to reduce flickering
  const debouncedOrderbookData = useDebounce(orderbookData, 300);
  
  // Effect to pass debounced data to parent
  useEffect(() => {
    if (!isClosing) {
      onOrderBookData(debouncedOrderbookData);
    }
  }, [debouncedOrderbookData, onOrderBookData, isClosing]);

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
      setOrderbookData(null);
      onOrderBookData(null);
      return;
    }

    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided');
      return;
    }

    // Clear any previous data when switching markets
    setOrderbookData(null);

    // Trigger initial fetch to populate data and establish WebSocket connection
    fetchOrderbookSnapshot(clobTokenId);

    // Create a unique channel name per market ID and component instance
    const channelName = `orderbook-updates-${clobTokenId}-${instanceIdRef.current}`;
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
          console.log('[LiveOrderBook] Received realtime update for market:', payload.new?.market_id);
          
          // Only process updates for the current market
          if (currentMarketRef.current !== clobTokenId) {
            console.log('[LiveOrderBook] Ignoring update for different market', {
              current: currentMarketRef.current,
              received: clobTokenId
            });
            return;
          }
          
          if (payload.new) {
            // Type assertion to help TypeScript understand the structure
            const newData = payload.new as OrderbookPayload;
            
            // Validate that the update is for the current market
            if (newData.market_id === clobTokenId) {
              const orderbookData: OrderBookData = {
                bids: newData.bids || {},
                asks: newData.asks || {},
                best_bid: newData.best_bid,
                best_ask: newData.best_ask,
                spread: newData.spread,
              };
              setOrderbookData(orderbookData);
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
      // Clear orderbook data
      setOrderbookData(null);
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
        setOrderbookData(data.orderbook);
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">
          {connectionStatus === "connecting" ? "Connecting to orderbook..." : "Loading orderbook..."}
        </span>
      </div>
    );
  }

  if (error && !isClosing) {
    return (
      <div className="text-center text-red-500 py-8">
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
