
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { TopMover } from '@/components/TopMoversList'
import { useTopMovers } from '@/hooks/useTopMovers'

interface MarketSearchResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

export function useMarketSearch(searchQuery: string = '', page: number = 1, probabilityMin?: number, probabilityMax?: number) {
  // Instead of using the search-markets function, we'll reuse the useTopMovers hook
  // which uses the get-top-movers function (still available)
  const topMoversQuery = useTopMovers(
    '1440', // Use 24h interval
    true,   // Open markets only
    searchQuery,
    undefined, // No specific marketId
    probabilityMin,
    probabilityMax
  );

  // Map the results to match the original format
  return {
    data: topMoversQuery.data?.pages ? topMoversQuery.data.pages.flatMap(page => page.data) : [],
    isLoading: topMoversQuery.isLoading,
    error: topMoversQuery.error,
    hasMore: topMoversQuery.hasNextPage || false,
    fetchNextPage: topMoversQuery.fetchNextPage,
    isFetchingNextPage: topMoversQuery.isFetchingNextPage,
    isFetching: topMoversQuery.isFetching,
    total: topMoversQuery.data?.pages?.[0]?.total
  };
}
