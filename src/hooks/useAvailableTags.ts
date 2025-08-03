import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagWithStats {
  name: string;
  count: number;
  movers?: number;
  avg_abs_price_change?: number;
}

export function useAvailableTags() {
  return useQuery({
    queryKey: ['availableTags'],
    queryFn: async (): Promise<TagWithStats[]> => {
      console.log('Fetching available tags...');
      
      const { data, error } = await supabase.functions.invoke('get-available-tags');

      if (error) {
        console.error('Error fetching available tags:', error);
        throw error;
      }
      
      console.log('Received available tags:', data);
      
      return data?.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    retryDelay: 1000
  });
}