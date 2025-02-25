
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { TopMover, SortByOption } from '@/types/market'

interface TopMoversResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

export function useTopMovers(
  interval: string, 
  openOnly: boolean, 
  searchQuery: string = '', 
  marketId?: string, 
  probabilityMin?: number, 
  probabilityMax?: number,
  priceChangeMin?: number,
  priceChangeMax?: number,
  volumeMin?: number,
  volumeMax?: number,
  sortBy: SortByOption = 'price_change'
) {
  // For single market view, use a simple query
  const singleMarketQuery = useQuery({
    queryKey: ['market', marketId],
    queryFn: async () => {
      if (!marketId) return null;
      
      console.log('Fetching single market:', marketId);
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: { 
          marketId,
          interval
        }
      });

      if (error) {
        console.error('Error fetching single market:', error);
        throw error;
      }
      
      if (!data?.data?.[0]) {
        console.log('Market not found, trying without filters');
        const { data: retryData, error: retryError } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
          body: {
            marketId,
            openOnly: false,
            interval
          }
        });
        
        if (retryError) {
          console.error('Error in retry fetch:', retryError);
          throw retryError;
        }
        return retryData?.data?.[0] || null;
      }
      
      return data.data[0];
    },
    enabled: !!marketId,
    retry: 1
  });

  // For list view, use infinite query
  const listQuery = useInfiniteQuery({
    queryKey: ['topMovers', interval, openOnly, searchQuery, probabilityMin, probabilityMax, priceChangeMin, priceChangeMax, volumeMin, volumeMax, sortBy],
    queryFn: async ({ pageParam = 1 }) => {
      console.log('Fetching top movers list with params:', { 
        interval, 
        openOnly, 
        page: pageParam, 
        searchQuery, 
        probabilityMin, 
        probabilityMax,
        priceChangeMin,
        priceChangeMax,
        volumeMin,
        volumeMax,
        sortBy
      });
      
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: {
          interval,
          openOnly,
          page: pageParam,
          limit: 20,
          searchQuery: searchQuery.trim(),
          probabilityMin,
          probabilityMax,
          priceChangeMin,
          priceChangeMax,
          volumeMin: volumeMin !== undefined ? Number(volumeMin) : undefined,
          volumeMax: volumeMax !== undefined ? Number(volumeMax) : undefined,
          sortBy
        }
      });

      if (error) {
        console.error('Error fetching top movers list:', error, error.message);
        throw new Error(`Failed to fetch top movers: ${error.message}`);
      }
      
      if (!data) {
        console.error('No data received from get-top-movers');
        throw new Error('No data received from server');
      }

      console.log('Received top movers response:', data);
      
      return {
        data: data.data || [],
        hasMore: data.hasMore || false,
        total: data.total,
        nextPage: data.hasMore ? pageParam + 1 : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: !marketId,
    retry: 1,
    retryDelay: 1000
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
