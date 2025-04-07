
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ResearchJob } from '@/types/research';
import { useToast } from '@/components/ui/use-toast';

export const useResearchHistory = (marketId: string) => {
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([]);
  const jobLoadTimesRef = useRef<Record<string, number>>({});
  const { toast } = useToast();

  const fetchSavedJobs = async () => {
    try {
      setIsLoadingJobs(true);
      console.log('Fetching saved jobs for market:', marketId);
      
      const startTime = performance.now();
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });
      
      const duration = performance.now() - startTime;
      
      if (error) {
        console.error('Error fetching research jobs:', error);
        return;
      }
      
      if (data && data.length > 0) {
        console.log(`Fetched ${data.length} jobs in ${duration.toFixed(0)}ms`);
        // Explicitly cast data to ResearchJob[] since we know the structure is compatible
        setSavedJobs(data as unknown as ResearchJob[]);
      } else {
        console.log(`No saved jobs found for market: ${marketId}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('Error in fetchSavedJobs:', errorMsg);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const loadSavedResearch = async (jobId: string, onLoadCallback: (job: ResearchJob) => void) => {
    try {
      setIsLoadingSaved(true);
      console.log(`Loading saved research job: ${jobId}`);
      
      const startTime = performance.now();
      jobLoadTimesRef.current[jobId] = startTime;
      
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
        
      const duration = performance.now() - startTime;
      console.log(`Job query completed in ${duration.toFixed(0)}ms`);
      
      if (error) {
        console.error('Error loading saved research:', error);
        toast({
          title: "Error",
          description: "Failed to load saved research job.",
          variant: "destructive"
        });
        return;
      }
      
      if (!data) {
        toast({
          title: "Error",
          description: "Research job not found.",
          variant: "destructive"
        });
        return;
      }
      
      // Cast to ResearchJob since we know the structure is compatible
      const job = data as unknown as ResearchJob;
      console.log('Loaded research job:', job);
      
      onLoadCallback(job);
      
      toast({
        title: "Research Loaded",
        description: `Loaded research job ${job.focus_text ? `focused on: ${job.focus_text}` : ''}`,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('Error loading saved research:', errorMsg);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading the research job.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingSaved(false);
    }
  };

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

  useEffect(() => {
    fetchSavedJobs();
  }, [marketId]);

  return {
    savedJobs,
    isLoadingJobs,
    isLoadingSaved,
    fetchSavedJobs,
    loadSavedResearch,
    extractProbability
  };
};
