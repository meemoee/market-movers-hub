
import { supabase } from "@/integrations/supabase/client";

export interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number | null;
  best_ask: number | null;
  spread: string | null;
  timestamp: string | null;
}

export const subscribeToOrderBook = (
  tokenId: string,
  onData: (data: OrderBookData) => void,
  onError?: (error: Error) => void
) => {
  // Subscribe to Supabase realtime channel for orderbook updates
  const channel = supabase.channel(`orderbook:${tokenId}`)
    .on('broadcast', { event: 'orderbook_update' }, (payload) => {
      onData(payload.payload as OrderBookData);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to orderbook updates for token ${tokenId}`);
      }
    });

  // Initial fetch to get current state
  fetchCurrentOrderBook(tokenId)
    .catch(error => onError?.(error));

  return () => {
    channel.unsubscribe();
  };
};

export const fetchCurrentOrderBook = async (tokenId: string): Promise<OrderBookData> => {
  const { data, error } = await supabase.functions.invoke('polymarket-stream', {
    body: { tokenId }
  });

  if (error) throw error;
  return data;
};
