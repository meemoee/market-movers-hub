
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
        // Type assertion to handle JSON conversion
        const typedJobs: ResearchJob[] = data.map(job => ({
          ...job,
          // Handle the Json[] to proper typed arrays conversion
          iterations: Array.isArray(job.iterations) ? job.iterations as unknown as any[] : [],
          progress_log: Array.isArray(job.progress_log) ? job.progress_log as string[] : []
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
      
      const job = data as unknown as ResearchJob;
      // Handle the Json[] to proper typed arrays conversion
      job.iterations = Array.isArray(job.iterations) ? job.iterations as unknown as any[] : [];
      job.progress_log = Array.isArray(job.progress_log) ? job.progress_log as string[] : [];
      
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
