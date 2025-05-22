
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface User {
  id: string;
  email: string;
  openrouter_api_key?: string | null;
}

export const useCurrentUser = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [userData, setUserData] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // If auth is still loading or user is not authenticated, wait
    if (authLoading) {
      return;
    }
    
    const fetchUserProfile = async () => {
      try {
        if (!user) {
          setUserData(null);
          setIsLoading(false);
          return;
        }
        
        // Get profile data including the openrouter_api_key
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('openrouter_api_key')
          .eq('id', user.id)
          .single();
        
        setUserData({
          id: user.id,
          email: user.email || '',
          openrouter_api_key: profile?.openrouter_api_key || null,
        });
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [user, authLoading]);
  
  return {
    user: userData,
    isLoading: isLoading || authLoading,
  };
};
