
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

export interface User {
  id: string;
  email: string;
  openrouter_api_key?: string | null;
}

export interface UserData {
  user: User | null;
  isLoading: boolean;
}

export const useCurrentUser = (): UserData => {
  const { user, isLoading: authLoading } = useAuth();
  const [userData, setUserData] = useState<User | null>(null);
  
  // Use React Query to fetch and cache the user profile data
  const { isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      // Get profile data including the openrouter_api_key
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('openrouter_api_key')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      setUserData({
        id: user.id,
        email: user.email || '',
        openrouter_api_key: profile?.openrouter_api_key || null,
      });
      
      return profile;
    },
    enabled: !!user && !authLoading,
    staleTime: 30000, // Cache for 30 seconds before considering stale
    refetchOnWindowFocus: false, // Prevent refetching when window refocuses
    refetchOnMount: false, // Prevent refetching on component mount
  });
  
  return {
    user: userData,
    isLoading: authLoading || profileLoading,
  };
};
