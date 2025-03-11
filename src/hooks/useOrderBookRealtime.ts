import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrderBookData {
  token_id: string;
  timestamp: string | null;
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export const useOrderBookRealtime = (tokenId: string | undefined) => {
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tokenId) return;

    setIsLoading(true);
    setError(null);

    // Initial fetch
    const fetchOrderBook = async () => {
      try {
        // Get the latest data
        const { data, error } = await supabase
          .from('orderbook_data')
          .select('*')
          .eq('token_id', tokenId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          setOrderBookData(data[0] as OrderBookData);
        }

        // Subscribe to the orderbook_data table for this token
        await supabase.functions.invoke('polymarket-orderbook-sync', {
          method: 'POST',
          body: { 
            tokenId 
          },
        });

      } catch (err) {
        console.error('Error fetching orderbook:', err);
        setError(err instanceof Error ? err : new Error('Unknown error occurred'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderBook();

    // Set up realtime subscription
    const channel = supabase
      .channel('orderbook-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orderbook_data',
          filter: `token_id=eq.${tokenId}`,
        },
        (payload) => {
          setOrderBookData(payload.new as OrderBookData);
        }
      )
      .subscribe();

    // Keep the subscription alive with heartbeats
    const heartbeatInterval = setInterval(async () => {
      try {
        await supabase.functions.invoke('polymarket-orderbook-sync', {
          method: 'POST',
          body: { 
            tokenId,
            action: 'heartbeat' 
          },
        });
      } catch (err) {
        console.warn('Heartbeat error:', err);
      }
    }, 30000);

    return () => {
      // Clean up
      supabase.removeChannel(channel);
      clearInterval(heartbeatInterval);
      
      // Unsubscribe when component unmounts
      supabase.functions.invoke('polymarket-orderbook-sync', {
        method: 'POST',
        body: { 
          tokenId,
          action: 'unsubscribe'
        },
      }).catch(err => console.warn('Error unsubscribing:', err));
    };
  }, [tokenId]);

  return { orderBookData, isLoading, error };
};
