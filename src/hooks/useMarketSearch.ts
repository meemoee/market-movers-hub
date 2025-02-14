
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { TopMover } from '@/components/TopMoversList'

interface MarketSearchResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

export function useMarketSearch(searchQuery: string = '', page: number = 1, probabilityMin?: number, probabilityMax?: number) {
  return useQuery({
    queryKey: ['marketSearch', searchQuery, page, probabilityMin, probabilityMax], // Include probability range in queryKey
    queryFn: async () => {
      console.log('Searching markets with:', { searchQuery, page, probabilityMin, probabilityMax });
      
      const { data, error } = await supabase.functions.invoke<MarketSearchResponse>('search-markets', {
        body: {
          searchQuery: searchQuery.trim(),
          page,
          limit: 20,
          probabilityMin,
          probabilityMax
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
    enabled: searchQuery.length > 0, // Only run query if there's a search term
    staleTime: 0,
    retry: 2,
    retryDelay: 1000
  })
}
