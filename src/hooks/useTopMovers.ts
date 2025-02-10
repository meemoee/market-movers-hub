
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useTopMovers(interval: string, openOnly: boolean, page: number = 1, searchQuery: string = '') {
  const queryClient = useQueryClient();

  return useQuery<TopMoversResponse, Error>({
    queryKey: ['topMovers', interval, openOnly, page, searchQuery],
    queryFn: async ({ queryKey }) => {
      console.log('Fetching top movers with:', { interval, openOnly, page, searchQuery });
      
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: {
          interval,
          openOnly,
          page,
          limit: 20,
          searchQuery: searchQuery.trim()  // Trim whitespace from search
        }
      })

      if (error) {
        console.error('Error fetching top movers:', error);
        throw error;
      }
      
      console.log('Received top movers response:', data);
      
      return {
        data: data?.data || [],
        hasMore: data?.hasMore || false,
        total: data?.total
      }
    },
    select: (data) => {
      if (page === 1) {
        return data;
      }

      // Get the previous data from the cache using queryClient
      const previousData = queryClient.getQueryData<TopMoversResponse>(
        ['topMovers', interval, openOnly, page - 1, searchQuery]
      );

      if (!previousData) {
        return data;
      }

      return {
        data: [...previousData.data, ...data.data],
        hasMore: data.hasMore,
        total: data.total
      };
    },
    staleTime: 0,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false
  })
}
