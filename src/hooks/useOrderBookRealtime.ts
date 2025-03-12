
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
  _mock?: boolean;
  _debug_info?: any;
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
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastAttemptTime, setLastAttemptTime] = useState(0);

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

        // Don't make too many attempts in a short period to avoid rate limiting
        const now = Date.now();
        if (attemptCount > 0 && now - lastAttemptTime < 5000) {
          console.log('[useOrderBookRealtime] Throttling API calls, waiting before retrying');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        setAttemptCount(prev => prev + 1);
        setLastAttemptTime(Date.now());

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

        console.log('[useOrderBookRealtime] Response from get-orderbook:', bookData);
        
        if (bookData && bookData.error) {
          console.error('[useOrderBookRealtime] Error from get-orderbook:', bookData.error);
          
          // Check if we got mock data we can use
          if (bookData.mock_data) {
            console.log('[useOrderBookRealtime] Using mock data as fallback');
            const mockData: OrderBookData = {
              ...bookData.mock_data,
              token_id: tokenId,
              timestamp: new Date().toISOString(),
            };
            setOrderBookData(mockData);
            // Still throw error to show message to user
            throw new Error(`${bookData.error}. Using mock data as fallback.`);
          } else {
            throw new Error(bookData.error);
          }
        }
        
        // Check if we received data with debugging info
        if (bookData && bookData._debug_info) {
          console.log('[useOrderBookRealtime] Received data with debug info:', bookData._debug_info);
        }
        
        // Check if the response has the expected structure
        if (bookData && (bookData.bids || bookData.asks)) {
          console.log('[useOrderBookRealtime] Successfully received orderbook data');
          
          // Process data for rendering in UI
          const processedData: OrderBookData = {
            token_id: tokenId,
            timestamp: new Date().toISOString(),
            bids: bookData.bids || {},
            asks: bookData.asks || {},
            best_bid: bookData.best_bid || Object.keys(bookData.bids || {}).reduce((max, price) => 
              Math.max(max, parseFloat(price)), 0),
            best_ask: bookData.best_ask || Object.keys(bookData.asks || {}).reduce((min, price) => 
              min === 0 ? parseFloat(price) : Math.min(min, parseFloat(price)), 0),
            spread: bookData.spread || 0,
            _debug_info: bookData._debug_info,
            _mock: bookData._mock
          };
          
          // Calculate spread if not provided
          if (!processedData.spread && processedData.best_ask && processedData.best_bid) {
            processedData.spread = processedData.best_ask - processedData.best_bid;
          }
          
          setOrderBookData(processedData);
        } else if (bookData) {
          console.warn('[useOrderBookRealtime] Response data does not match expected format:', bookData);
          
          // Try to extract or construct data from unexpected format
          const constructedData: OrderBookData = {
            token_id: tokenId,
            timestamp: new Date().toISOString(),
            bids: {},
            asks: {},
            best_bid: 0,
            best_ask: 0,
            spread: 0,
            _debug_info: {
              message: 'Constructed from unexpected data format',
              original_data: bookData
            }
          };
          
          setOrderBookData(constructedData);
          
          // Notify about unexpected format but don't throw error
          toast({
            title: "Unexpected data format",
            description: "The orderbook data has an unexpected format. Some features may not work correctly.",
            variant: "default",
          });
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
  }, [tokenId, attemptCount, lastAttemptTime]);

  return { orderBookData, isLoading, error };
};
