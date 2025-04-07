import { useState, useEffect, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/integrations/supabase/client"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { useToast } from "@/components/ui/use-toast"
// import { SSEMessage } from "supabase/functions/web-scrape/types" // Likely unused now
import { IterationCard } from "./research/IterationCard"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle, AlertCircle, Clock, History, Mail, Settings } from "lucide-react"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number;
  noBestBid?: number;
  outcomes?: string[];
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

// Define the type for ResearchJob including the new column and statuses
interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: 'queued' | 'processing' | 'generating_final_analysis' | 'extracting_insights' | 'completed' | 'failed'; // Added new statuses
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  results: any; // Contains insights only when completed
  final_analysis_stream?: string; // New column for streaming final analysis
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  user_id?: string;
  focus_text?: string;
  notification_email?: string;
  notification_sent?: boolean;
}


export function JobQueueResearchCard({
  description,
  marketId,
  bestBid,
  bestAsk,
  noBestAsk,
  noBestBid,
  outcomes
}: JobQueueResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [progressPercent, setProgressPercent] = useState<number>(0)
  const [results, setResults] = useState<ResearchResult[]>([]) // Keep for potential future use or remove if only insights are stored
  const [error, setError] = useState<string | null>(null)
  // const [analysis, setAnalysis] = useState('') // Removed, replaced by streamingFinalAnalysis
  const [jobId, setJobId] = useState<string | null>(null)
  const [iterations, setIterations] = useState<any[]>([])
  const [expandedIterations, setExpandedIterations] = useState<number[]>([])
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'generating_final_analysis' | 'extracting_insights' | 'completed' | 'failed' | null>(null) // Added new statuses
  const [structuredInsights, setStructuredInsights] = useState<any>(null)
  const [streamingFinalAnalysis, setStreamingFinalAnalysis] = useState<string>(''); // New state for final analysis stream
  const [isFinalAnalysisStreaming, setIsFinalAnalysisStreaming] = useState<boolean>(false); // New state for final analysis streaming status
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [notifyByEmail, setNotifyByEmail] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [maxIterations, setMaxIterations] = useState<string>("3")
  const realtimeChannelRef = useRef<any>(null)
  const jobLoadTimesRef = useRef<Record<string, number>>({})
  const updateLogRef = useRef<Array<{time: number, type: string, info: string}>>([])
  const { toast } = useToast()


  // Debug logging utils
  const logUpdate = (type: string, info: string) => {
    console.log(`🔍 JobCard ${type}: ${info}`);
    updateLogRef.current.push({
      time: Date.now(),
      type,
      info
    });

    // Keep the log at a reasonable size
    if (updateLogRef.current.length > 100) {
      updateLogRef.current.shift();
    }
  }

  const resetState = () => {
    logUpdate('reset-state', 'Resetting state of research component');

    setJobId(null);
    setProgress([]);
    setProgressPercent(0);
    setResults([]); // Clear old results if needed
    setError(null);
    // setAnalysis(''); // Removed
    setStreamingFinalAnalysis(''); // Reset new state
    setIsFinalAnalysisStreaming(false); // Reset new state
    setIterations([]);
    setExpandedIterations([]);
    setJobStatus(null);
    setStructuredInsights(null);

    if (realtimeChannelRef.current) {
      logUpdate('reset-state', 'Removing existing realtime channel');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }

  useEffect(() => {
    fetchSavedJobs();

    logUpdate('component-mount', `Component mounted for market: ${marketId}`);

    return () => {
      if (realtimeChannelRef.current) {
        logUpdate('component-unmount', 'Removing realtime channel on unmount');
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }

      // Log all accumulated data on unmount
      console.log('📊 JOB QUEUE RESEARCH CARD LOG DUMP ON UNMOUNT');
      console.log('📊 Update logs:', updateLogRef.current);
      console.log('📊 Job load times:', jobLoadTimesRef.current);
    };
  }, [marketId]);

  const fetchSavedJobs = async () => {
    try {
      setIsLoadingJobs(true);
      logUpdate('fetch-jobs', `Fetching saved jobs for market: ${marketId}`);

      const startTime = performance.now();
      // Fetch final_analysis_stream as well
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*') // Select all columns including the new one
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      const duration = performance.now() - startTime;

      if (error) {
        logUpdate('fetch-jobs-error', `Error fetching research jobs: ${error.message}`);
        console.error('Error fetching research jobs:', error);
        return;
      }

      if (data && data.length > 0) {
        logUpdate('fetch-jobs-success', `Fetched ${data.length} jobs in ${duration.toFixed(0)}ms`);
        setSavedJobs(data as ResearchJob[]);
      } else {
        logUpdate('fetch-jobs-empty', `No saved jobs found for market: ${marketId}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logUpdate('fetch-jobs-exception', `Exception in fetchSavedJobs: ${errorMsg}`);
      console.error('Error in fetchSavedJobs:', e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const subscribeToJobUpdates = (id: string) => {
    if (realtimeChannelRef.current) {
      logUpdate('realtime-cleanup', 'Removing existing realtime channel before creating new one');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    logUpdate('realtime-setup', `Setting up realtime subscription for job id: ${id}`);

    const channel = supabase
      .channel(`job-updates-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'research_jobs',
          filter: `id=eq.${id}`
        },
        (payload: any) => { // Add type annotation
          logUpdate('realtime-update', `Received realtime update for job: ${id}, event: ${payload.eventType}`);
          console.log('Received realtime update:', payload);
          // Ensure payload.new has the correct type
          handleJobUpdate(payload.new as ResearchJob);
        }
      )
      .subscribe((status) => {
        logUpdate('realtime-status', `Realtime subscription status: ${status} for job: ${id}`);
        console.log(`Realtime subscription status: ${status}`, id);
      });

    realtimeChannelRef.current = channel;
  };

  const handleJobUpdate = (job: ResearchJob) => {
    logUpdate('job-update', `Processing job update for job: ${job.id}, status: ${job.status}, iteration: ${job.current_iteration}/${job.max_iterations}`);
    console.log('Processing job update:', job);

    setJobStatus(job.status);

    // --- START MODIFICATION: Handle new statuses and final analysis stream ---
    if (job.status === 'generating_final_analysis') {
      setIsFinalAnalysisStreaming(true);
      if (job.final_analysis_stream) { // Check if the column exists in the payload
        setStreamingFinalAnalysis(job.final_analysis_stream);
      }
      logUpdate('final-analysis-stream', `Streaming final analysis, length: ${job.final_analysis_stream?.length || 0}`);
    } else if (job.status === 'extracting_insights') {
      setIsFinalAnalysisStreaming(false); // Streaming of text is done
      if (job.final_analysis_stream) { // Ensure we have the final text
         setStreamingFinalAnalysis(job.final_analysis_stream);
      }
      logUpdate('final-analysis-stream', `Finished streaming final analysis, length: ${job.final_analysis_stream?.length || 0}. Extracting insights.`);
    } else if (job.status === 'completed') {
      setIsFinalAnalysisStreaming(false);
      if (job.final_analysis_stream) { // Ensure we have the final text
         setStreamingFinalAnalysis(job.final_analysis_stream);
      }
      logUpdate('final-analysis-stream', `Job complete. Final analysis length: ${job.final_analysis_stream?.length || 0}`);
    } else {
       // If status reverts or is different (e.g., back to 'processing' or 'queued'), stop streaming indicator
       setIsFinalAnalysisStreaming(false);
    }
    // --- END MODIFICATION ---


    if (job.max_iterations && job.current_iteration !== undefined) {
      // Adjust progress calculation based on new statuses
      const isGeneratingFinal = job.status === 'generating_final_analysis' || job.status === 'extracting_insights';
      // Show 100% only when fully completed, otherwise calculate based on current step
      let percent = 0;
      if (job.status === 'completed') {
        percent = 100;
      } else if (isGeneratingFinal) {
        // Assign a high percentage during final steps, e.g., 95%
        percent = 95;
      } else if (job.status === 'processing') {
        percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      }
      logUpdate('progress-update', `Setting progress to ${percent}% (${job.current_iteration}/${job.max_iterations}, status: ${job.status})`);
      setProgressPercent(percent);
    }

    if (job.progress_log && Array.isArray(job.progress_log)) {
      const currentProgress = progress;
      const newItems = job.progress_log.slice(currentProgress.length);

      if (newItems.length > 0) {
        logUpdate('progress-log', `Adding ${newItems.length} new progress log items`);
        console.log('Adding new progress items:', newItems);
        setProgress(prev => [...prev, ...newItems]);
      }
    }

    if (job.iterations && Array.isArray(job.iterations)) {
      logUpdate('iterations-update', `Setting ${job.iterations.length} iterations`);
      console.log('Iteration details:', job.iterations.map(it => ({
        iteration: it.iteration,
        analysisLength: it.analysis?.length || 0,
        queriesCount: it.queries?.length || 0,
        resultsCount: it.results?.length || 0
      })));
      setIterations(job.iterations);

      // Expand the latest iteration if the job is still processing iterations
      if (job.status === 'processing' && job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
        logUpdate('expand-iteration', `Auto-expanding iteration ${job.current_iteration}`);
        setExpandedIterations(prev => [...prev, job.current_iteration]);
      }
    }

    // --- Modify results processing for 'completed' status ---
    if (job.status === 'completed' && job.results) {
      try {
        logUpdate('process-results', `Processing completed job results (insights only) for job: ${job.id}`);
        console.log('Processing completed job results (insights only):', job.results);

        // Handle both string and object results (job.results now only contains insights)
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
            logUpdate('parse-results', 'Successfully parsed string results to JSON');
          } catch (parseError) {
            const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
            logUpdate('parse-results-error', `Error parsing job.results string: ${errorMsg}`);
            console.error('Error parsing job.results string:', parseError);
            throw new Error('Invalid results format (string parsing failed)');
          }
        } else if (typeof job.results === 'object') {
          logUpdate('parse-results', 'Results already in object format');
          parsedResults = job.results;
        } else {
          logUpdate('parse-results-error', `Unexpected results type: ${typeof job.results}`);
          throw new Error(`Unexpected results type: ${typeof job.results}`);
        }

        // --- START MODIFICATION ---
        // Remove setting final analysis from here
        // Remove setting web results (data) from here unless needed alongside insights
        setResults([]); // Clear old web results if not included with insights

        // Process structuredInsights as before
        if (parsedResults.structuredInsights) {
          logUpdate('set-insights', `Found structuredInsights`);
          console.log('Found structuredInsights:', parsedResults.structuredInsights);

          const goodBuyOpportunities = parsedResults.structuredInsights.probability ?
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) :
            null;

          if (goodBuyOpportunities) {
            logUpdate('opportunities', `Found ${goodBuyOpportunities.length} good buy opportunities`);
          }

          // Correctly structure the data for InsightsDisplay
          setStructuredInsights({
            rawText: typeof parsedResults.structuredInsights === 'string'
              ? parsedResults.structuredInsights
              : JSON.stringify(parsedResults.structuredInsights),
            parsedData: {
              ...parsedResults.structuredInsights,
              goodBuyOpportunities
            }
          });
        } else {
           // Clear insights if not present in final results
           setStructuredInsights(null);
        }
        // --- END MODIFICATION ---

        fetchSavedJobs();
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logUpdate('process-results-error', `Error processing job results: ${errorMsg}`);
        console.error('Error processing job results:', e);
      }
    }

    if (job.status === 'failed') {
      logUpdate('job-failed', `Job failed: ${job.error_message || 'Unknown error'}`);
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
      setProgress(prev => [...prev, `Job failed: ${job.error_message || 'Unknown error'}`]);
      setIsFinalAnalysisStreaming(false); // Ensure streaming stops on failure

      fetchSavedJobs();
    }
  };

  const loadJobData = (job: ResearchJob) => {
    const startTime = performance.now();
    jobLoadTimesRef.current[job.id] = startTime;

    logUpdate('load-job', `Loading job data for job: ${job.id}, status: ${job.status}, focus: ${job.focus_text || 'none'}`);

    setJobId(job.id);
    setJobStatus(job.status);

    if (job.max_iterations && job.current_iteration !== undefined) {
      // Adjust progress calculation based on new statuses
      const isGeneratingFinal = job.status === 'generating_final_analysis' || job.status === 'extracting_insights';
      let percent = 0;
      if (job.status === 'completed') {
        percent = 100;
      } else if (isGeneratingFinal) {
        percent = 95; // Assign high percentage during final steps
      } else if (job.status === 'processing') {
        percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      }
      logUpdate('set-progress', `Setting progress to ${percent}% (${job.current_iteration}/${job.max_iterations}, status: ${job.status})`);
      setProgressPercent(percent);
    }

    if (job.progress_log && Array.isArray(job.progress_log)) {
      logUpdate('set-progress-log', `Setting ${job.progress_log.length} progress log entries`);
      setProgress(job.progress_log);
    }

    // --- START MODIFICATION: Handle new statuses and final analysis stream on load ---
     if (job.status === 'generating_final_analysis' || job.status === 'extracting_insights' || job.status === 'completed') {
       if (job.final_analysis_stream) {
         setStreamingFinalAnalysis(job.final_analysis_stream);
         logUpdate('load-job-final-analysis', `Loaded final analysis stream, length: ${job.final_analysis_stream.length}`);
       }
     }
     if (job.status === 'generating_final_analysis') {
       setIsFinalAnalysisStreaming(true);
     } else {
       setIsFinalAnalysisStreaming(false);
     }
    // --- END MODIFICATION ---

    // Subscribe if job is still active (includes new intermediate statuses)
    if (job.status === 'queued' || job.status === 'processing' || job.status === 'generating_final_analysis' || job.status === 'extracting_insights') {
      logUpdate('subscribe-updates', `Setting up realtime subscription for active job: ${job.id}`);
      subscribeToJobUpdates(job.id); // Ensure subscription includes final_analysis_stream
    }

    if (job.iterations && Array.isArray(job.iterations)) {
      logUpdate('set-iterations', `Setting ${job.iterations.length} iterations`);
      setIterations(job.iterations);

      if (job.iterations.length > 0) {
        logUpdate('expand-iteration', `Auto-expanding latest iteration ${job.iterations.length}`);
        setExpandedIterations([job.iterations.length]);
      }
    }

    // --- Modify results processing for 'completed' status on load ---
    if (job.status === 'completed' && job.results) {
      try {
        logUpdate('process-results', `Processing results (insights only) for loaded completed job: ${job.id}`);
        // Handle both string and object results (job.results now only contains insights)
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
            logUpdate('parse-results', 'Successfully parsed string results to JSON');
          } catch (parseError) {
            const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
            logUpdate('parse-results-error', `Error parsing job.results string in loadJobData: ${errorMsg}`);
            console.error('Error parsing job.results string in loadJobData:', parseError);
            throw new Error('Invalid results format (string parsing failed)');
          }
        } else if (typeof job.results === 'object') {
          logUpdate('parse-results', 'Results already in object format');
          parsedResults = job.results;
        } else {
          logUpdate('parse-results-error', `Unexpected results type: ${typeof job.results}`);
          throw new Error(`Unexpected results type: ${typeof job.results}`);
        }

        // --- START MODIFICATION ---
        // Remove setting final analysis from here
        // Remove setting web results (data) from here unless needed alongside insights
        setResults([]); // Clear old web results

        // Process structuredInsights as before
        if (parsedResults.structuredInsights) {
          logUpdate('set-insights', `Found structuredInsights in loaded job`);
          console.log('Found structuredInsights in loadJobData:', parsedResults.structuredInsights);

          const goodBuyOpportunities = parsedResults.structuredInsights.probability ?
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) :
            null;

          if (goodBuyOpportunities) {
            logUpdate('opportunities', `Found ${goodBuyOpportunities.length} good buy opportunities`);
          }

          // Correctly structure the data for InsightsDisplay
          setStructuredInsights({
            rawText: typeof parsedResults.structuredInsights === 'string'
              ? parsedResults.structuredInsights
              : JSON.stringify(parsedResults.structuredInsights),
            parsedData: {
              ...parsedResults.structuredInsights,
              goodBuyOpportunities
            }
          });
        }
        // --- END MODIFICATION ---

      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logUpdate('process-results-error', `Error processing loaded job results: ${errorMsg}`);
        console.error('Error processing loaded job results:', e);
      }
    }

    if (job.status === 'failed') {
      logUpdate('job-failed', `Job failed: ${job.error_message || 'Unknown error'}`);
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
      setIsFinalAnalysisStreaming(false); // Ensure streaming stops on failure
    }

    if (job.focus_text) {
      logUpdate('set-focus', `Setting focus text: ${job.focus_text}`);
      setFocusText(job.focus_text);
    }

    const duration = performance.now() - startTime;
    logUpdate('job-load-complete', `Job data load completed in ${duration.toFixed(0)}ms`);
  }

  const calculateGoodBuyOpportunities = (probabilityStr: string) => {
    if (!probabilityStr || !bestAsk || !outcomes || outcomes.length < 2) {
      logUpdate('opportunities-calc', `Missing data for opportunity calculation`);
      return null;
    }

    const probability = parseInt(probabilityStr.replace('%', '').trim()) / 100;
    if (isNaN(probability)) {
      logUpdate('opportunities-calc', `Invalid probability format: ${probabilityStr}`);
      return null;
    }

    logUpdate('opportunities-calc', `Calculating opportunities with probability ${probability}, bestAsk ${bestAsk}`);

    const THRESHOLD = 0.05;

    const opportunities = [];

    if (probability > bestAsk + THRESHOLD) {
      logUpdate('opportunity-found', `Found opportunity for YES: ${probability} vs ${bestAsk}`);
      opportunities.push({
        outcome: outcomes[0],
        predictedProbability: probability,
        marketPrice: bestAsk,
        difference: (probability - bestAsk).toFixed(2)
      });
    }

    const inferredProbability = 1 - probability;
    const noAskPrice = noBestAsk !== undefined ? noBestAsk : (bestBid !== undefined ? 1 - bestBid : undefined); // Handle undefined bestBid

    if (noAskPrice !== undefined && inferredProbability > noAskPrice + THRESHOLD) {
      logUpdate('opportunity-found', `Found opportunity for NO: ${inferredProbability} vs ${noAskPrice}`);
      opportunities.push({
        outcome: outcomes[1] || "NO",
        predictedProbability: inferredProbability,
        marketPrice: noAskPrice,
        difference: (inferredProbability - noAskPrice).toFixed(2)
      });
    }

    return opportunities.length > 0 ? opportunities : null;
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

  const handleResearch = async (initialFocusText = '') => {
    resetState();
    setIsLoading(true);

    const useFocusText = initialFocusText || focusText;
    const numIterations = parseInt(maxIterations, 10);

    try {
      logUpdate('start-research', `Starting research job with ${numIterations} iterations`);
      setProgress(prev => [...prev, "Starting research job..."]);

      const payload = {
        marketId,
        query: description,
        maxIterations: numIterations,
        focusText: useFocusText.trim() || undefined,
        notificationEmail: notifyByEmail && notificationEmail.trim() ? notificationEmail.trim() : undefined
      };

      logUpdate('create-job', `Creating research job with payload: marketId=${marketId}, maxIterations=${numIterations}`);
      console.log('Creating research job with payload:', payload);

      const startTime = performance.now();
      const response = await supabase.functions.invoke('create-research-job', {
        body: JSON.stringify(payload)
      });

      const duration = performance.now() - startTime;
      logUpdate('job-creation-response', `Job creation completed in ${duration.toFixed(0)}ms`);

      if (response.error) {
        logUpdate('job-creation-error', `Error creating research job: ${response.error.message}`);
        console.error("Error creating research job:", response.error);
        throw new Error(`Error creating research job: ${response.error.message}`);
      }

      if (!response.data || !response.data.jobId) {
        logUpdate('job-creation-error', `Invalid response from server - no job ID returned`);
        throw new Error("Invalid response from server - no job ID returned");
      }

      const newJobId = response.data.jobId;
      logUpdate('job-created', `Research job created with ID: ${newJobId}`);
      console.log(`Research job created with ID: ${newJobId}`);

      setJobId(newJobId);
      setJobStatus('queued');
      setProgress(prev => [...prev, `Research job created with ID: ${newJobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      setProgress(prev => [...prev, `Set to run ${numIterations} research iterations`]);

      subscribeToJobUpdates(newJobId);

      const toastMessage = notifyByEmail && notificationEmail.trim()
        ? `Job ID: ${newJobId}. Email notification will be sent to ${notificationEmail} when complete.`
        : `Job ID: ${newJobId}. You can close this window and check back later.`;

      toast({
        title: "Background Research Started",
        description: toastMessage,
      });

      fetchSavedJobs();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logUpdate('research-error', `Error in research job: ${errorMsg}`);
      console.error('Error in research job:', error);
      setError(`Error occurred during research job: ${errorMsg}`);
      setJobStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIterationExpand = (iteration: number) => {
    logUpdate('toggle-iteration', `Toggling expansion of iteration #${iteration}`);
    setExpandedIterations(prev =>
      prev.includes(iteration)
        ? prev.filter(i => i !== iteration)
        : [...prev, iteration]
    );
  };

  const loadSavedResearch = async (jobId: string) => {
    try {
      setIsLoadingSaved(true);
      logUpdate('load-saved', `Loading saved research job: ${jobId}`);

      resetState();

      const startTime = performance.now();
      // Ensure we select the new column when loading saved jobs
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*') // Select all columns
        .eq('id', jobId)
        .single();

      const duration = performance.now() - startTime;
      logUpdate('load-job-query', `Job query completed in ${duration.toFixed(0)}ms`);

      if (error) {
        logUpdate('load-job-error', `Error loading saved research: ${error.message}`);
        console.error('Error loading saved research:', error);
        toast({
          title: "Error",
          description: "Failed to load saved research job.",
          variant: "destructive"
        });
        setIsLoadingSaved(false);
        return;
      }

      if (!data) {
        logUpdate('load-job-error', `Research job not found: ${jobId}`);
        toast({
          title: "Error",
          description: "Research job not found.",
          variant: "destructive"
        });
        setIsLoadingSaved(false);
        return;
      }

      const job = data as ResearchJob;
      logUpdate('job-loaded', `Loaded research job ${jobId}, status: ${job.status}, created: ${new Date(job.created_at).toISOString()}`);
      console.log('Loaded research job:', job);

      loadJobData(job);

      toast({
        title: "Research Loaded",
        description: `Loaded research job ${job.focus_text ? `focused on: ${job.focus_text}` : ''}`,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logUpdate('load-job-exception', `Error loading saved research: ${errorMsg}`);
      console.error('Error loading saved research:', e);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading the research job.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const handleResearchArea = (area: string) => {
    logUpdate('research-area', `Starting focused research on: ${area}`);
    setFocusText('');

    toast({
      title: "Starting Focused Research",
      description: `Creating new research job focused on: ${area}`,
    });

    handleResearch(area);
  };

  const handleClearDisplay = () => {
    logUpdate('clear-display', 'Clearing display and resetting state');
    resetState();
    setFocusText('');
  };

  const renderStatusBadge = () => {
    if (!jobStatus) return null;

    switch (jobStatus) {
      case 'queued':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3" />
            <span>Queued</span>
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing Iterations</span>
          </Badge>
        );
      // --- START MODIFICATION: Add badges for new statuses ---
      case 'generating_final_analysis':
         return (
           <Badge variant="outline" className="flex items-center gap-1 bg-purple-50 text-purple-700 border-purple-200">
             <Loader2 className="h-3 w-3 animate-spin" />
             <span>Generating Analysis</span>
           </Badge>
         );
      case 'extracting_insights':
         return (
           <Badge variant="outline" className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border-indigo-200">
             <Loader2 className="h-3 w-3 animate-spin" />
             <span>Extracting Insights</span>
           </Badge>
         );
      // --- END MODIFICATION ---
      case 'completed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3" />
            <span>Completed</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date);
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500 mr-2" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500 mr-2" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2" />;
      // --- START MODIFICATION: Add icons for new statuses ---
      case 'generating_final_analysis':
        return <Loader2 className="h-4 w-4 text-purple-500 animate-spin mr-2" />;
      case 'extracting_insights':
        return <Loader2 className="h-4 w-4 text-indigo-500 animate-spin mr-2" />;
      // --- END MODIFICATION ---
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500 mr-2" />;
      default:
        return null;
    }
  };

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between w-full max-w-full">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Background Job Research</h2>
            {renderStatusBadge()}
          </div>
          <p className="text-sm text-muted-foreground">
            This research continues in the background even if you close your browser.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {jobId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearDisplay}
              disabled={isLoading || isLoadingSaved}
            >
              New Research
            </Button>
          ) : (
            <Button
              onClick={() => handleResearch()}
              disabled={isLoading || (notifyByEmail && !notificationEmail.trim())}
              className="flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Starting..." : "Start Research"}
            </Button>
          )}

          {savedJobs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isLoadingJobs || isLoading || isLoadingSaved}
                  className="flex items-center gap-2"
                >
                  {isLoadingJobs ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <History className="h-4 w-4 mr-2" />
                  )}
                  History ({savedJobs.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px] max-h-[400px] overflow-y-auto">
                {savedJobs.map((job) => {
                  const probability = extractProbability(job);

                  return (
                    <DropdownMenuItem
                      key={job.id}
                      onClick={() => loadSavedResearch(job.id)}
                      disabled={isLoadingSaved}
                      className="flex flex-col items-start py-2"
                    >
                      <div className="flex items-center w-full">
                        {getStatusIcon(job.status)}
                        <span className="font-medium truncate flex-1">
                          {job.focus_text ? job.focus_text.slice(0, 20) + (job.focus_text.length > 20 ? '...' : '') : 'General research'}
                        </span>
                        <Badge
                          variant="outline"
                          className={`ml-2 ${
                            job.status === 'completed' ? 'bg-green-50 text-green-700' :
                            job.status === 'failed' ? 'bg-red-50 text-red-700' :
                            job.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                            job.status === 'generating_final_analysis' ? 'bg-purple-50 text-purple-700' : // Added
                            job.status === 'extracting_insights' ? 'bg-indigo-50 text-indigo-700' : // Added
                            'bg-yellow-50 text-yellow-700'
                          }`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between w-full mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(job.created_at)}
                        </span>
                        {probability && (
                          <Badge variant="secondary" className="text-xs">
                            P: {probability}
                          </Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {!jobId && (
        <>
          <div className="flex flex-col space-y-4 w-full">
            <div className="flex items-center gap-2 w-full">
              <Input
                placeholder="Add an optional focus area for your research..."
                value={focusText}
                onChange={(e) => setFocusText(e.target.value)}
                disabled={isLoading}
                className="flex-1"
              />
            </div>

            <div className="flex flex-col space-y-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <Label>Iterations</Label>
              </div>
              <Select
                value={maxIterations}
                onValueChange={setMaxIterations}
                disabled={isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Number of iterations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 iteration</SelectItem>
                  <SelectItem value="2">2 iterations</SelectItem>
                  <SelectItem value="3">3 iterations (default)</SelectItem>
                  <SelectItem value="4">4 iterations</SelectItem>
                  <SelectItem value="5">5 iterations</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                More iterations provide deeper research but take longer to complete.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="notify-email"
                  checked={notifyByEmail}
                  onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
                />
                <Label htmlFor="notify-email" className="cursor-pointer">
                  Notify me by email when research is complete
                </Label>
              </div>

              {notifyByEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Enter your email address"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    className="flex-1"
                  />
                </div>
              )}

              <Button
                onClick={() => handleResearch()}
                disabled={isLoading || (notifyByEmail && !notificationEmail.trim())}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Starting...
                  </>
                ) : (
                  "Start Background Research"
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {focusText && jobId && (
        <div className="bg-accent/10 px-3 py-2 rounded-md text-sm">
          <span className="font-medium">Research focus:</span> {focusText}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-2 rounded w-full max-w-full">
          {error}
        </div>
      )}

      {jobId && (
        <ProgressDisplay
          messages={progress}
          jobId={jobId || undefined}
          progress={progressPercent}
          status={jobStatus}
        />
      )}

      {iterations.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full space-y-2">
          <h3 className="text-lg font-medium mb-2">Research Iterations</h3>
          <div className="space-y-2">
            {iterations.map((iteration) => (
              <IterationCard
                key={iteration.iteration}
                iteration={iteration}
                isExpanded={expandedIterations.includes(iteration.iteration)}
                onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
                isStreaming={jobStatus === 'processing'} // Iteration streaming only happens during 'processing' status
                isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                maxIterations={parseInt(maxIterations, 10)}
              />
            ))}
          </div>
        </div>
      )}

      {/* --- START MODIFICATION: Add Final Analysis Display --- */}
      {streamingFinalAnalysis && (jobStatus === 'generating_final_analysis' || jobStatus === 'extracting_insights' || jobStatus === 'completed' || jobStatus === 'failed') && (
         <div className="border-t pt-4 w-full max-w-full">
           <h3 className="text-lg font-medium mb-2">Final Analysis</h3>
           <AnalysisDisplay
             content={streamingFinalAnalysis}
             isStreaming={isFinalAnalysisStreaming} // Use the new state variable
             maxHeight="300px" // Or adjust as needed
           />
         </div>
       )}
      {/* --- END MODIFICATION --- */}


      {/* Existing Insights Display (renders based on structuredInsights state) */}
      {structuredInsights && structuredInsights.parsedData && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Research Insights</h3>
          <InsightsDisplay
            streamingState={structuredInsights} // Pass the state derived from job.results
            onResearchArea={handleResearchArea}
            marketData={{
              bestBid,
              bestAsk,
              noBestAsk,
              outcomes
            }}
          />
        </div>
      )}

      {/* Remove the old final analysis display block if it existed separately */}
      {/* {analysis && ( ... remove this block ... )} */}

      {/* Keep Search Results display if needed, but ensure 'results' state is handled correctly */}
      {/* {results.length > 0 && ( ... SitePreviewList ... )} */}

    </Card>
  );
}
