import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ResearchJob } from '@/types/research'; // Import the centralized type

/**
 * Custom hook to fetch and manage saved research jobs for a specific market.
 * @param marketId The ID of the market for which to fetch jobs.
 * @returns An object containing the list of saved jobs, loading state, and a function to refetch.
 */
export function useSavedResearchJobs(marketId: string | null) {
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedJobs = useCallback(async () => {
    if (!marketId) {
      setSavedJobs([]); // Clear jobs if no marketId
      return;
    }

    setIsLoadingJobs(true);
    setError(null);
    console.log(`[useSavedResearchJobs] Fetching saved jobs for market: ${marketId}`);

    try {
      const startTime = performance.now();
      const { data, error: fetchError } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      const duration = performance.now() - startTime;

      if (fetchError) {
        console.error('[useSavedResearchJobs] Error fetching research jobs:', fetchError);
        setError(`Failed to fetch research jobs: ${fetchError.message}`);
        setSavedJobs([]); // Clear jobs on error
        return;
      }

      if (data && data.length > 0) {
        console.log(`[useSavedResearchJobs] Fetched ${data.length} jobs in ${duration.toFixed(0)}ms`);
        // Explicitly cast the fetched data to our defined type via unknown.
        // This assumes the database schema matches the ResearchJob interface.
        setSavedJobs(data as unknown as ResearchJob[]);
      } else {
        console.log(`[useSavedResearchJobs] No saved jobs found for market: ${marketId}`);
        setSavedJobs([]);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('[useSavedResearchJobs] Exception in fetchSavedJobs:', e);
      setError(`An unexpected error occurred: ${errorMsg}`);
      setSavedJobs([]); // Clear jobs on exception
    } finally {
      setIsLoadingJobs(false);
    }
  }, [marketId]); // Dependency array includes marketId

  // Fetch jobs when the marketId changes
  useEffect(() => {
    fetchSavedJobs();
  }, [fetchSavedJobs]); // fetchSavedJobs is memoized by useCallback

  return {
    savedJobs,
    isLoadingJobs,
    error,
    refetchJobs: fetchSavedJobs // Expose the fetch function to allow manual refetching
  };
}
