
import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { ResearchJob } from '@/types/research';
import { useToast } from "@/components/ui/use-toast";
import { Json } from '@/integrations/supabase/types';

interface UseResearchHistoryProps {
  marketId: string;
}

export function useResearchHistory({ marketId }: UseResearchHistoryProps) {
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const { toast } = useToast();

  const fetchSavedJobs = async () => {
    try {
      setIsLoadingJobs(true);
      console.log('Fetching saved jobs for market:', marketId);
      
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching research jobs:', error);
        return;
      }
      
      if (data && data.length > 0) {
        // Map and validate the data to ensure it conforms to the ResearchJob type
        const typedJobs: ResearchJob[] = data.map(job => ({
          ...job,
          // Ensure status is one of the allowed values
          status: validateStatus(job.status),
          // Handle the Json[] to proper typed arrays conversion
          iterations: Array.isArray(job.iterations) ? job.iterations as any[] : [],
          progress_log: Array.isArray(job.progress_log) ? job.progress_log as string[] : [],
          // Ensure nullable fields are handled properly
          error_message: job.error_message || undefined,
          focus_text: job.focus_text || undefined,
          notification_email: job.notification_email || undefined,
          notification_sent: job.notification_sent || false,
          completed_at: job.completed_at || undefined,
          started_at: job.started_at || undefined,
          user_id: job.user_id || undefined
        }));
        
        setSavedJobs(typedJobs);
      } else {
        console.log('No saved jobs found');
      }
    } catch (e) {
      console.error('Error in fetchSavedJobs:', e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  // Helper function to validate status is one of the allowed types
  const validateStatus = (status: string): 'queued' | 'processing' | 'completed' | 'failed' => {
    switch (status) {
      case 'queued':
      case 'processing':
      case 'completed':
      case 'failed':
        return status;
      default:
        console.warn(`Invalid status value encountered: ${status}, defaulting to 'queued'`);
        return 'queued'; // Default to a valid status if we get an unexpected value
    }
  };

  useEffect(() => {
    fetchSavedJobs();
  }, [marketId]);

  const extractProbability = (job: ResearchJob): string | null => {
    if (!job.results || job.status !== 'completed') return null;
    
    try {
      // Handle both string and object results
      let parsedResults;
      if (typeof job.results === 'string') {
        try {
          parsedResults = JSON.parse(job.results);
        } catch (parseError) {
          console.error('Error parsing job.results string in extractProbability:', parseError);
          return null;
        }
      } else if (typeof job.results === 'object') {
        parsedResults = job.results;
      } else {
        console.error('Unexpected results type in extractProbability:', typeof job.results);
        return null;
      }
      
      if (parsedResults.structuredInsights && parsedResults.structuredInsights.probability) {
        return parsedResults.structuredInsights.probability;
      }
      return null;
    } catch (e) {
      console.error('Error extracting probability from job results:', e);
      return null;
    }
  };

  const loadSavedResearch = async (jobId: string) => {
    try {
      setIsLoadingSaved(true);
      console.log('Loading saved research job:', jobId);
      
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
        
      if (error) {
        console.error('Error loading saved research:', error);
        toast({
          title: "Error",
          description: "Failed to load saved research job.",
          variant: "destructive"
        });
        return null;
      }
      
      if (!data) {
        toast({
          title: "Error",
          description: "Research job not found.",
          variant: "destructive"
        });
        return null;
      }
      
      // Transform and validate the job data to match our ResearchJob type
      const jobData = data as any;
      const job: ResearchJob = {
        ...jobData,
        status: validateStatus(jobData.status),
        iterations: Array.isArray(jobData.iterations) ? jobData.iterations as any[] : [],
        progress_log: Array.isArray(jobData.progress_log) ? jobData.progress_log as string[] : [],
        error_message: jobData.error_message || undefined,
        focus_text: jobData.focus_text || undefined,
        notification_email: jobData.notification_email || undefined,
        notification_sent: jobData.notification_sent || false,
        completed_at: jobData.completed_at || undefined,
        started_at: jobData.started_at || undefined,
        user_id: jobData.user_id || undefined
      };
      
      return job;
      
    } catch (e) {
      console.error('Error loading saved research:', e);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading the research job.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoadingSaved(false);
    }
  };

  return {
    savedJobs,
    isLoadingJobs,
    isLoadingSaved,
    fetchSavedJobs,
    loadSavedResearch,
    extractProbability
  };
}
