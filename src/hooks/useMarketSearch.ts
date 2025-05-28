import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { TopMover } from '@/components/TopMoversList'

interface MarketSearchResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

export function useMarketSearch(
  searchQuery: string = '', 
  page: number = 1, 
  probabilityMin?: number, 
  probabilityMax?: number,
  selectedTags: string[] = []
) {
  return useQuery({
    queryKey: ['marketSearch', searchQuery, page, probabilityMin, probabilityMax, selectedTags],
    queryFn: async () => {
      console.log('Searching markets with:', { searchQuery, page, probabilityMin, probabilityMax, selectedTags });
      
      // Ensure search query is properly trimmed
      const trimmedQuery = searchQuery.trim();
      
      const { data, error } = await supabase.functions.invoke<MarketSearchResponse>('search-markets', {
        body: {
          searchQuery: trimmedQuery,
          page,
          limit: 20,
          probabilityMin,
          probabilityMax,
          selectedTags: selectedTags.length > 0 ? selectedTags : undefined
        }
      });

      if (error) {
        console.error('Error searching markets:', error);
        throw error;
      }
      
      console.log('Received market search response:', data);
      
      // Add detailed logging for debugging
      if (data?.data?.length) {
        console.log('First market in results:', {
          id: data.data[0].market_id,
          question: data.data[0].question,
          probability: data.data[0].final_last_traded_price
        });
      }
      
      return {
        data: data?.data || [],
        hasMore: data?.hasMore || false,
        total: data?.total
      };
    },
    enabled: true,
    staleTime: 0,
    retry: 2,
    retryDelay: 1000
  });
}
