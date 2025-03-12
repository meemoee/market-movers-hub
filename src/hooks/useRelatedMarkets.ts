
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RelatedMarket {
  market_id: string;
  question: string;
  probability: number;
  price_change?: number;
}

export function useRelatedMarkets(marketId: string, interval: string = '1440') {
  return useQuery({
    queryKey: ['relatedMarkets', marketId, interval],
    queryFn: async (): Promise<RelatedMarket[]> => {
      if (!marketId) return [];

      try {
        // First, get the event_id for the current market
        const { data: marketData, error: marketError } = await supabase
          .from('markets')
          .select('event_id')
          .eq('id', marketId)
          .single();

        if (marketError || !marketData?.event_id) {
          console.error('Error fetching market event_id:', marketError);
          return [];
        }

        // Get all markets in the same event
        const { data: markets, error } = await supabase
          .from('markets')
          .select(`
            id,
            question
          `)
          .eq('event_id', marketData.event_id)
          .neq('id', marketId);

        if (error || !markets.length) {
          console.error('Error fetching related markets:', error);
          return [];
        }

        // Get price data for these markets
        const { data: topMoversData, error: topMoversError } = await supabase.functions.invoke<{
          data: Array<{
            market_id: string;
            final_last_traded_price: number;
            price_change: number;
          }>;
        }>('get-top-movers', {
          body: { 
            marketIds: markets.map(m => m.id),
            interval
          }
        });

        if (topMoversError) {
          console.error('Error fetching top movers data:', topMoversError);
          return [];
        }

        // Combine market data with price data
        const relatedMarkets = markets
          .map(market => {
            const priceData = topMoversData?.data?.find(m => m.market_id === market.id);
            if (!priceData) return null;

            return {
              market_id: market.id,
              question: market.question,
              probability: priceData.final_last_traded_price,
              price_change: priceData.price_change
            };
          })
          .filter(Boolean) as RelatedMarket[];

        console.log(`Found ${relatedMarkets.length} related markets for ${marketId}`);
        return relatedMarkets;
      } catch (error) {
        console.error('Error in useRelatedMarkets:', error);
        return [];
      }
    },
    enabled: !!marketId
  });
}
