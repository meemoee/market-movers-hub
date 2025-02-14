
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
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

export function useTopMovers(interval: string, openOnly: boolean, searchQuery: string = '', marketId?: string, probabilityMin?: number, probabilityMax?: number) {
  // For single market view, use a simple query instead of infinite query
  const singleMarketQuery = useQuery({
    queryKey: ['market', marketId],
    queryFn: async () => {
      if (!marketId) return null;
      
      console.log('Fetching single market:', marketId);
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: { 
          marketId,
          interval // Include interval to get the correct time period data
        }
      });

      if (error) throw error;
      
      if (!data?.data?.[0]) {
        console.log('Market not found, trying without filters');
        // Try one more time without any filters
        const { data: retryData, error: retryError } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
          body: {
            marketId,
            openOnly: false,
            interval // Include interval here too
          }
        });
        
        if (retryError) throw retryError;
        return retryData?.data?.[0] || null;
      }
      
      return data.data[0];
    },
    enabled: !!marketId
  });

  // For list view, use infinite query
  const listQuery = useInfiniteQuery({
    queryKey: ['topMovers', interval, openOnly, searchQuery, probabilityMin, probabilityMax],
    queryFn: async ({ pageParam = 1 }) => {
      console.log('Fetching top movers list:', { interval, openOnly, page: pageParam, searchQuery, probabilityMin, probabilityMax });
      
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: {
          interval,
          openOnly,
          page: pageParam,
          limit: 20,
          searchQuery: searchQuery.trim(),
          probabilityMin,
          probabilityMax
        }
      });

      if (error) throw error;
      
      return {
        data: data?.data || [],
        hasMore: data?.hasMore || false,
        total: data?.total,
        nextPage: data?.hasMore ? pageParam + 1 : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: !marketId // Only enable list query when not viewing a single market
  });

  // Return appropriate data structure based on whether we're viewing a single market
  if (marketId) {
    return {
      data: { pages: [{ data: singleMarketQuery.data ? [singleMarketQuery.data] : [] }] },
      isLoading: singleMarketQuery.isLoading,
      error: singleMarketQuery.error,
      hasNextPage: false,
      fetchNextPage: () => Promise.resolve(),
      isFetchingNextPage: false,
      isFetching: singleMarketQuery.isFetching
    };
  }

  return listQuery;
}
