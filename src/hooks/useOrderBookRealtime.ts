import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrderBookData {
  token_id: string;
  timestamp: string;
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
}

export function useOrderBookRealtime(tokenId: string | undefined) {
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial data and subscribe to updates
  useEffect(() => {
    if (!tokenId) {
      setOrderBookData(null);
      setIsLoading(false);
      return;
    }

    let subscription: any = null;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Subscribe to the orderbook
        const response = await supabase.functions.invoke('polymarket-orderbook-sync/subscribe', {
          body: { tokenId }
        });
        
        if (response.error) {
          throw new Error(response.error.message || 'Failed to subscribe to orderbook');
        }
        
        if (response.data?.data) {
          setOrderBookData(response.data.data);
        }
        
        // Set up realtime subscription
        subscription = supabase
          .channel(`orderbook-${tokenId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'orderbook_data',
              filter: `token_id=eq.${tokenId}`
            },
            (payload) => {
              setOrderBookData(payload.new as OrderBookData);
            }
          )
          .subscribe();
        
        // Set up heartbeat to keep subscription active
        heartbeatInterval = setInterval(async () => {
          try {
            await supabase.functions.invoke('polymarket-orderbook-sync/heartbeat', {
              body: { tokenId }
            });
          } catch (err) {
            console.error('Error sending heartbeat:', err);
          }
        }, 30000); // Every 30 seconds
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching orderbook data:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };
    
    fetchInitialData();
    
    // Cleanup
    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      // Unsubscribe from the orderbook
      supabase.functions.invoke('polymarket-orderbook-sync/unsubscribe', {
        body: { tokenId }
      }).catch(err => {
        console.error('Error unsubscribing from orderbook:', err);
      });
    };
  }, [tokenId]);

  return { orderBookData, isLoading, error };
}
