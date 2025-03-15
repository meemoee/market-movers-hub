
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { ProgressUpdate } from 'supabase/functions/web-scrape/types';

interface ResearchJob {
  id: string;
  market_id: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress_log?: Json[] | null;
  results?: any[] | null;
  analysis?: string | null;
  insights?: any | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Custom hook to manage research job operations
 */
export function useResearchJob(jobId?: string, marketId?: string) {
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<Json[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);

  // Fetch job data
  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setJob(data as ResearchJob);
        setProgress(data.progress_log || []);
        
        // Calculate progress percentage
        if (data.status === 'completed') {
          setProgressPercent(100);
        } else if (data.progress_log && data.progress_log.length > 0) {
          // For simplicity, estimate progress based on log length
          // In a real app, you might want to track progress more accurately
          const estimatedProgress = Math.min(Math.floor((data.progress_log.length / 10) * 100), 95);
          setProgressPercent(data.status === 'running' ? estimatedProgress : estimatedProgress);
        } else {
          setProgressPercent(data.status === 'running' ? 10 : 0);
        }
      }
    } catch (err) {
      console.error('Error fetching research job:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch job'));
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Start a new job
  const startJob = useCallback(async (description: string) => {
    if (!marketId) {
      throw new Error('Market ID is required to start a job');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Call the edge function to create a new job
      const { data, error } = await supabase.functions.invoke('create-research-job', {
        body: { marketId, description }
      });
      
      if (error) throw error;
      
      if (data?.jobId) {
        // Wait a moment for the job to be created in the database
        setTimeout(() => {
          // Then fetch the job details
          fetchJob();
        }, 1000);
        
        return data.jobId;
      } else {
        throw new Error('No job ID returned from job creation');
      }
    } catch (err) {
      console.error('Error creating research job:', err);
      setError(err instanceof Error ? err : new Error('Error creating research job'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [marketId, fetchJob]);

  // Pause a running job
  const pauseJob = useCallback(async () => {
    if (!job?.id) return;
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('research_jobs')
        .update({ status: 'paused' })
        .eq('id', job.id);
      
      if (error) throw error;
      
      // Update local state
      setJob(prev => prev ? { ...prev, status: 'paused' } : null);
    } catch (err) {
      console.error('Error pausing job:', err);
      setError(err instanceof Error ? err : new Error('Failed to pause job'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [job?.id]);

  // Resume a paused job
  const resumeJob = useCallback(async () => {
    if (!job?.id) return;
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('research_jobs')
        .update({ status: 'queued' })
        .eq('id', job.id);
      
      if (error) throw error;
      
      // Update local state
      setJob(prev => prev ? { ...prev, status: 'queued' } : null);
    } catch (err) {
      console.error('Error resuming job:', err);
      setError(err instanceof Error ? err : new Error('Failed to resume job'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [job?.id]);

  // Cancel a job
  const cancelJob = useCallback(async () => {
    if (!job?.id) return;
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('research_jobs')
        .update({ status: 'failed' })
        .eq('id', job.id);
      
      if (error) throw error;
      
      // Update local state
      setJob(prev => prev ? { ...prev, status: 'failed' } : null);
    } catch (err) {
      console.error('Error cancelling job:', err);
      setError(err instanceof Error ? err : new Error('Failed to cancel job'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [job?.id]);

  // Refresh job data
  const refreshJob = useCallback(async () => {
    await fetchJob();
  }, [fetchJob]);

  // Initial fetch
  useEffect(() => {
    if (jobId) {
      fetchJob();
    }
  }, [jobId, fetchJob]);

  return {
    job,
    isLoading,
    error,
    progress,
    progressPercent,
    startJob,
    pauseJob,
    resumeJob,
    cancelJob,
    refreshJob
  };
}
