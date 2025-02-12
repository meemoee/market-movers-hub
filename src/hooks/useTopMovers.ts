
import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

interface TopMoversResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

interface TopMover {
  market_id: string;
  question: string;
  url: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  description?: string;
  clobtokenids?: any;
  outcomes?: any;
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  event_id: string;
  event_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_volume: number;
  initial_last_traded_price: number;
  initial_volume: number;
  price_change: number;
  volume_change: number;
  volume_change_percentage: number;
}

export function useTopMovers(interval: string, openOnly: boolean, searchQuery: string = '', marketId?: string) {
  return useInfiniteQuery({
    queryKey: ['topMovers', interval, openOnly, searchQuery, marketId],
    queryFn: async ({ pageParam = 1 }) => {
      console.log('Fetching top movers with:', { interval, openOnly, page: pageParam, searchQuery, marketId });
      
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: {
          interval,
          openOnly,
          page: pageParam,
          limit: marketId ? 1 : 20,
          searchQuery: searchQuery.trim(),
          marketId
        }
      })

      if (error) {
        console.error('Error fetching top movers:', error);
        throw error;
      }
      
      console.log('Received top movers response:', data);
      
      if (marketId && (!data?.data || data.data.length === 0)) {
        // If we're looking for a specific market but didn't find it,
        // make another call without the interval restriction
        const { data: singleMarketData, error: singleMarketError } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
          body: {
            marketId,
            page: 1,
            limit: 1,
            openOnly: false // We want to find the market even if it's closed
          }
        });

        if (singleMarketError) throw singleMarketError;
        
        return {
          data: singleMarketData?.data || [],
          hasMore: false,
          total: singleMarketData?.data?.length || 0,
          nextPage: undefined
        };
      }
      
      return {
        data: data?.data || [],
        hasMore: data?.hasMore || false,
        total: data?.total,
        nextPage: data?.hasMore ? pageParam + 1 : undefined
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 0,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false
  })
}
