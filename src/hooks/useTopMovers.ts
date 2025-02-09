
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

interface TopMoversResponse {
  data: TopMover[];
  hasMore: boolean;
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
  return useQuery({
    queryKey: ['topMovers', interval, openOnly, page, searchQuery],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<TopMoversResponse>('get-top-movers', {
        body: {
          interval,
          openOnly,
          page,
          limit: 20,
          searchQuery
        }
      })

      if (error) throw error
      
      // Ensure we return a valid response even if data is null
      return {
        data: data?.data || [],
        hasMore: data?.hasMore || false
      }
    },
    // Prevent refetching while loading more
    staleTime: 30000,
    // Use placeholderData instead of keepPreviousData
    placeholderData: (previousData) => previousData
  })
}
