import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export interface OrderBookData {
  token_id: string;
  timestamp: string | null;
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

// Type for the database response
interface OrderBookDataDB {
  id: number;
  market_id: string;
  timestamp: string;
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
    console.log(`[useOrderBookRealtime] Initialize with tokenId: ${tokenId}`);

    // Initial fetch
    const fetchOrderBook = async () => {
      try {
        console.log(`[useOrderBookRealtime] Fetching orderbook for tokenId: ${tokenId}`);
        
        // Get the latest data
        const { data, error } = await supabase
          .from('orderbook_data')
          .select('*')
          .eq('market_id', tokenId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (error) {
          console.error(`[useOrderBookRealtime] Database error:`, error);
          throw error;
        }

        if (data && data.length > 0) {
          console.log(`[useOrderBookRealtime] Found existing orderbook data in DB`);
          // Convert from DB schema to our OrderBookData type
          const dbData = data[0] as OrderBookDataDB;
          const orderBookData: OrderBookData = {
            token_id: dbData.market_id,
            timestamp: dbData.timestamp,
            bids: dbData.bids,
            asks: dbData.asks,
            best_bid: dbData.best_bid,
            best_ask: dbData.best_ask,
            spread: dbData.spread
          };
          
          setOrderBookData(orderBookData);
        } else {
          console.log(`[useOrderBookRealtime] No existing orderbook data in DB`);
        }

        // Call the get-orderbook function to fetch latest data
        console.log(`[useOrderBookRealtime] Calling get-orderbook function for tokenId: ${tokenId}`);
        const { data: bookData, error: bookError } = await supabase.functions.invoke('get-orderbook', {
          method: 'POST',
          body: { 
            tokenId 
          },
        });

        if (bookError) {
          console.error('[useOrderBookRealtime] Error invoking get-orderbook:', bookError);
          throw new Error(`Failed to fetch orderbook: ${bookError.message}`);
        }

        console.log('[useOrderBookRealtime] Successfully received data from get-orderbook:', bookData);
        
        // If we got data back, we could process it here if needed
        if (bookData && !bookData.error) {
          // Process the data if needed
          console.log('[useOrderBookRealtime] Processing orderbook data');
        }

      } catch (err) {
        console.error('[useOrderBookRealtime] Error fetching orderbook:', err);
        setError(err instanceof Error ? err : new Error('Unknown error occurred'));
        
        // Show toast notification for error
        toast({
          title: "Error loading orderbook",
          description: err instanceof Error ? err.message : 'Failed to load orderbook data',
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderBook();

    // Set up realtime subscription
    console.log(`[useOrderBookRealtime] Setting up realtime subscription for tokenId: ${tokenId}`);
    const channel = supabase
      .channel('orderbook-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orderbook_data',
          filter: `market_id=eq.${tokenId}`,
        },
        (payload) => {
          console.log(`[useOrderBookRealtime] Received realtime update:`, payload);
          // Convert the payload to our OrderBookData type
          const dbData = payload.new as OrderBookDataDB;
          const orderBookData: OrderBookData = {
            token_id: dbData.market_id,
            timestamp: dbData.timestamp,
            bids: dbData.bids,
            asks: dbData.asks,
            best_bid: dbData.best_bid,
            best_ask: dbData.best_ask,
            spread: dbData.spread
          };
          
          setOrderBookData(orderBookData);
        }
      )
      .subscribe((status) => {
        console.log(`[useOrderBookRealtime] Channel subscription status:`, status);
      });

    // Keep the subscription alive with heartbeats
    const heartbeatInterval = setInterval(async () => {
      try {
        console.log(`[useOrderBookRealtime] Sending heartbeat for tokenId: ${tokenId}`);
        await supabase.functions.invoke('get-orderbook', {
          method: 'POST',
          body: { 
            tokenId,
            action: 'heartbeat' 
          },
        });
      } catch (err) {
        console.warn('[useOrderBookRealtime] Heartbeat error:', err);
      }
    }, 30000);

    return () => {
      console.log(`[useOrderBookRealtime] Cleaning up for tokenId: ${tokenId}`);
      // Clean up
      supabase.removeChannel(channel);
      clearInterval(heartbeatInterval);
      
      // Unsubscribe when component unmounts
      supabase.functions.invoke('get-orderbook', {
        method: 'POST',
        body: { 
          tokenId,
          action: 'unsubscribe'
        },
      }).catch(err => console.warn('[useOrderBookRealtime] Error unsubscribing:', err));
    };
  }, [tokenId]);

  return { orderBookData, isLoading, error };
};
