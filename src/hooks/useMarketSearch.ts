
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { TopMover } from '@/components/TopMoversList'

interface MarketSearchResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

export function useMarketSearch(searchQuery: string = '', page: number = 1) {
  return useQuery({
    queryKey: ['marketSearch', searchQuery, page],
    queryFn: async () => {
      console.log('Searching markets with:', { searchQuery, page });
      
      const { data, error } = await supabase.functions.invoke<MarketSearchResponse>('search-markets', {
        body: {
          searchQuery: searchQuery.trim(),
          page,
          limit: 20
        }
      })

      if (error) {
        console.error('Error searching markets:', error);
        throw error;
      }
      
      console.log('Received market search response:', data);
      
      return {
        data: data?.data || [],
        hasMore: data?.hasMore || false,
        total: data?.total
      }
    },
    enabled: searchQuery.length >= 2, // Only search when at least 2 characters are typed
    staleTime: 30000, // Cache results for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes (renamed from cacheTime)
    retry: 1, // Only retry once on failure
    retryDelay: 500 // Retry after 500ms instead of 1000ms
  })
}
