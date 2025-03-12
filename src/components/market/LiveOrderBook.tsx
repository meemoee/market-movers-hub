import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface RealtimePayload {
  new: {
    market_id: string;
    bids: Record<string, number>;
    asks: Record<string, number>;
    best_bid: number;
    best_ask: number;
    spread: number;
  };
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
  const previousDataRef = useRef<OrderBookData | null>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const currentMarketRef = useRef<string | null>(null);
  const instanceIdRef = useRef<string>(`orderbook-${Math.random().toString(36).substring(2, 11)}`);
  
  const debouncedOrderbookData = useDebounce(orderbookData, 600);
  
  useEffect(() => {
    if (debouncedOrderbookData) {
      previousDataRef.current = debouncedOrderbookData;
    }
  }, [debouncedOrderbookData]);
  
  useEffect(() => {
    if (!isClosing) {
      const dataToSend = debouncedOrderbookData || previousDataRef.current;
      onOrderBookData(dataToSend);
    }
  }, [debouncedOrderbookData, onOrderBookData, isClosing]);

  useEffect(() => {
    currentMarketRef.current = clobTokenId || null;
    
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, clearing state and subscriptions');
      setError(null);
      if (subscriptionRef.current) {
        console.log('[LiveOrderBook] Unsubscribing from channel');
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      
      onOrderBookData(null);
      return;
    }

    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided');
      return;
    }

    fetchOrderbookSnapshot(clobTokenId);

    const channelName = `orderbook-updates-${clobTokenId}-${instanceIdRef.current}`;
    console.log(`[LiveOrderBook] Creating new channel: ${channelName} for market ${clobTokenId}`);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orderbook_data',
          filter: `market_id=eq.${clobTokenId}`,
        },
        (payload) => {
          const typedPayload = payload as unknown as RealtimePayload;
          console.log('[LiveOrderBook] Received realtime update for market:', typedPayload.new?.market_id);
          
          if (currentMarketRef.current !== clobTokenId) {
            console.log('[LiveOrderBook] Ignoring update for different market', {
              current: currentMarketRef.current,
              received: clobTokenId
            });
            return;
          }
          
          if (typedPayload.new) {
            if (typedPayload.new.market_id === clobTokenId) {
              const orderbookData: OrderBookData = {
                bids: typedPayload.new.bids || previousDataRef.current?.bids || {},
                asks: typedPayload.new.asks || previousDataRef.current?.asks || {},
                best_bid: typedPayload.new.best_bid,
                best_ask: typedPayload.new.best_ask,
                spread: typedPayload.new.spread,
              };
              setOrderbookData(orderbookData);
              setConnectionStatus("connected");
              setError(null);
            } else {
              console.warn('[LiveOrderBook] Received update for wrong market', {
                expected: clobTokenId,
                received: typedPayload.new.market_id
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

    subscriptionRef.current = channel;

    return () => {
      console.log(`[LiveOrderBook] Cleaning up subscription for ${clobTokenId}`);
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
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
        
        const newOrderbookData = {
          bids: data.orderbook.bids || previousDataRef.current?.bids || {},
          asks: data.orderbook.asks || previousDataRef.current?.asks || {},
          best_bid: data.orderbook.best_bid,
          best_ask: data.orderbook.best_ask,
          spread: data.orderbook.spread,
        };
        
        setOrderbookData(newOrderbookData);
        previousDataRef.current = newOrderbookData;
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

  return (
    <div className="hidden">
      {/* Hidden component that ensures the component stays mounted */}
    </div>
  );
}
