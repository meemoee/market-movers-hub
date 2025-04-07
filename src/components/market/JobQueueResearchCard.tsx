import { useState, useEffect, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/integrations/supabase/client"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { useToast } from "@/hooks/use-toast"
import { SSEMessage } from "supabase/functions/web-scrape/types"
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

interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  results: any;
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
  const [results, setResults] = useState<ResearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [streamingAnalysis, setStreamingAnalysis] = useState('') // New state for streaming final analysis
  const [isAnalysisStreaming, setIsAnalysisStreaming] = useState(false) // Track if final analysis is streaming
  const [jobId, setJobId] = useState<string | null>(null)
  const [iterations, setIterations] = useState<any[]>([])
  const [expandedIterations, setExpandedIterations] = useState<number[]>([])
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [structuredInsights, setStructuredInsights] = useState<any>(null)
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [notifyByEmail, setNotifyByEmail] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [maxIterations, setMaxIterations] = useState<string>("3")
  const realtimeChannelRef = useRef<any>(null)
  const analysisStreamChannelRef = useRef<any>(null) // New ref for analysis stream channel
  const jobLoadTimesRef = useRef<Record<string, number>>({})
  const updateLogRef = useRef<Array<{time: number, type: string, info: string}>>([])
  const { toast } = useToast()

  const logUpdate = (type: string, info: string) => {
    console.log(`🔍 JobCard ${type}: ${info}`);
    updateLogRef.current.push({
      time: Date.now(),
      type,
      info
    });
    
    if (updateLogRef.current.length > 100) {
      updateLogRef.current.shift();
    }
  }

  const resetState = () => {
    logUpdate('reset-state', 'Resetting state of research component');
    
    setJobId(null);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setError(null);
    setAnalysis('');
    setStreamingAnalysis('');
    setIsAnalysisStreaming(false);
    setIterations([]);
    setExpandedIterations([]);
    setJobStatus(null);
    setStructuredInsights(null);
    
    if (realtimeChannelRef.current) {
      logUpdate('reset-state', 'Removing existing realtime channel');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    
    if (analysisStreamChannelRef.current) {
      logUpdate('reset-state', 'Removing analysis stream channel');
      supabase.removeChannel(analysisStreamChannelRef.current);
      analysisStreamChannelRef.current = null;
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
      
      if (analysisStreamChannelRef.current) {
        logUpdate('component-unmount', 'Removing analysis stream channel on unmount');
        supabase.removeChannel(analysisStreamChannelRef.current);
        analysisStreamChannelRef.current = null;
      }
      
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
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
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

  const subscribeToAnalysisStream = (jobId: string) => {
    if (analysisStreamChannelRef.current) {
      logUpdate('analysis-stream-cleanup', 'Removing existing analysis stream channel');
      supabase.removeChannel(analysisStreamChannelRef.current);
      analysisStreamChannelRef.current = null;
    }
    
    logUpdate('analysis-stream-setup', `Setting up analysis stream for job id: ${jobId}`);
    
    const channel = supabase
      .channel(`analysis-stream-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analysis_stream',
          filter: `job_id=eq.${jobId} AND iteration=eq.0`
        },
        (payload) => {
          if (payload.new && payload.new.chunk) {
            logUpdate('analysis-stream-update', `Received analysis chunk for job: ${jobId}`);
            setIsAnalysisStreaming(true);
            setStreamingAnalysis(prev => prev + payload.new.chunk);
          }
        }
      )
      .subscribe((status) => {
        logUpdate('analysis-stream-status', `Analysis stream subscription status: ${status} for job: ${jobId}`);
      });
    
    analysisStreamChannelRef.current = channel;
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
        (payload) => {
          logUpdate('realtime-update', `Received realtime update for job: ${id}, event: ${payload.eventType}`);
          console.log('Received realtime update:', payload);
          handleJobUpdate(payload.new as ResearchJob);
        }
      )
      .subscribe((status) => {
        logUpdate('realtime-status', `Realtime subscription status: ${status} for job: ${id}`);
        console.log(`Realtime subscription status: ${status}`, id);
      });
    
    realtimeChannelRef.current = channel;
    
    subscribeToAnalysisStream(id);
  };

  const handleJobUpdate = (job: ResearchJob) => {
    logUpdate('job-update', `Processing job update for job: ${job.id}, status: ${job.status}, iteration: ${job.current_iteration}/${job.max_iterations}`);
    console.log('Processing job update:', job);
    
    setJobStatus(job.status);
    
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      const newPercent = job.status === 'completed' ? 100 : percent;
      logUpdate('progress-update', `Setting progress to ${newPercent}% (${job.current_iteration}/${job.max_iterations})`);
      setProgressPercent(newPercent);
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
      
      if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
        logUpdate('expand-iteration', `Auto-expanding iteration ${job.current_iteration}`);
        setExpandedIterations(prev => [...prev, job.current_iteration]);
      }
    }
    
    if (job.status === 'completed' && job.results) {
      try {
        logUpdate('process-results', `Processing completed job results for job: ${job.id}`);
        console.log('Processing completed job results:', job.results);
        
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
        
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          logUpdate('set-results', `Setting ${parsedResults.data.length} research results`);
          setResults(parsedResults.data);
        }
        
        if (parsedResults.analysis) {
          const analysisLength = parsedResults.analysis?.length || 0;
          logUpdate('set-analysis', `Setting analysis with length ${analysisLength}`);
          console.log(`Analysis first 100 chars: "${parsedResults.analysis.substring(0, 100)}..."`);
          setAnalysis(parsedResults.analysis);
          
          if (isAnalysisStreaming) {
            setIsAnalysisStreaming(false);
            setStreamingAnalysis(parsedResults.analysis);
          }
        }
        
        if (parsedResults.structuredInsights) {
          logUpdate('set-insights', `Found structuredInsights`);
          console.log('Found structuredInsights:', parsedResults.structuredInsights);
          
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
          if (goodBuyOpportunities) {
            logUpdate('opportunities', `Found ${goodBuyOpportunities.length} good buy opportunities`);
          }
          
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
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      logUpdate('set-progress', `Setting progress to ${percent}% (${job.current_iteration}/${job.max_iterations})`);
      setProgressPercent(percent);
      
      if (job.status === 'completed') {
        setProgressPercent(100);
      }
    }
    
    if (job.progress_log && Array.isArray(job.progress_log)) {
      logUpdate('set-progress-log', `Setting ${job.progress_log.length} progress log entries`);
      setProgress(job.progress_log);
    }
    
    if (job.status === 'queued' || job.status === 'processing') {
      logUpdate('subscribe-updates', `Setting up realtime subscription for active job: ${job.id}`);
      subscribeToJobUpdates(job.id);
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      logUpdate('set-iterations', `Setting ${job.iterations.length} iterations`);
      setIterations(job.iterations);
      
      if (job.iterations.length > 0) {
        logUpdate('expand-iteration', `Auto-expanding latest iteration ${job.iterations.length}`);
        setExpandedIterations([job.iterations.length]);
      }
    }
    
    if (job.status === 'completed' && job.results) {
      try {
        logUpdate('process-results', `Processing results for completed job: ${job.id}`);
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
          console.error('Unexpected results type in loadJobData:', typeof job.results);
          throw new Error(`Unexpected results type: ${typeof job.results}`);
        }
        
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          logUpdate('set-results', `Setting ${parsedResults.data.length} research results`);
          setResults(parsedResults.data);
        }
        
        if (parsedResults.analysis) {
          const analysisLength = parsedResults.analysis?.length || 0;
          logUpdate('set-analysis', `Setting analysis with length ${analysisLength}`);
          console.log(`Analysis first 100 chars: "${parsedResults.analysis.substring(0, 100)}..."`);
          setAnalysis(parsedResults.analysis);
          setStreamingAnalysis(parsedResults.analysis);
        }
        
        if (parsedResults.structuredInsights) {
          logUpdate('set-insights', `Found structuredInsights`);
          console.log('Found structuredInsights in loadJobData:', parsedResults.structuredInsights);
          
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
          if (goodBuyOpportunities) {
            logUpdate('opportunities', `Found ${goodBuyOpportunities.length} good buy opportunities`);
          }
          
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
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logUpdate('process-results-error', `Error processing loaded job results: ${errorMsg}`);
        console.error('Error processing loaded job results:', e);
      }
    }
    
    if (job.status === 'failed') {
      logUpdate('job-failed', `Job failed: ${job.error_message || 'Unknown error'}`);
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
    }
    
    if (job.focus_text) {
      logUpdate('set-focus', `Setting focus text: ${job.focus_text}`);
      setFocusText(job.focus_text);
    }
    
    const duration = performance.now() - startTime;
    logUpdate('job-load-complete', `Job data load completed in ${duration.toFixed(0)}ms`);
    
    if (job.status === 'processing') {
      subscribeToAnalysisStream(job.id);
    }
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
    const noAskPrice = noBestAsk !== undefined ? noBestAsk : 1 - bestBid;
    
    if (inferredProbability > noAskPrice + THRESHOLD) {
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
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
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
            <span>Processing</span>
          </Badge>
        );
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
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500 mr-2" />;
      default:
        return null;
    }
  };

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between w-full max-w-full">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Research</h3>
          {renderStatusBadge()}
        </div>
        
        <div className="flex items-center gap-2">
          {jobId && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearDisplay}
              className="text-xs h-8"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      
      {!jobId ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="focus-text">Research Focus (Optional)</Label>
              <Input 
                id="focus-text" 
                placeholder="Specific topic or question to investigate" 
                value={focusText}
                onChange={(e) => setFocusText(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <Label htmlFor="iterations">Iterations</Label>
              <Select value={maxIterations} onValueChange={setMaxIterations}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Number of iterations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Quick research</SelectItem>
                  <SelectItem value="2">2 - Basic research</SelectItem>
                  <SelectItem value="3">3 - Standard research</SelectItem>
                  <SelectItem value="4">4 - Thorough research</SelectItem>
                  <SelectItem value="5">5 - Deep research</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <Checkbox 
                id="email-notify" 
                checked={notifyByEmail}
                onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="email-notify" className="text-sm">Email notification when complete</Label>
                {notifyByEmail && (
                  <Input 
                    id="notification-email" 
                    placeholder="your@email.com" 
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    className="w-full mt-1"
                    type="email"
                  />
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => handleResearch()}
              className="w-full"
              disabled={isLoading || isLoadingSaved}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Research
            </Button>
          </div>
          
          {isLoadingJobs ? (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">Loading previous research...</p>
            </div>
          ) : savedJobs && savedJobs.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Previous Research</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {savedJobs.map((job) => (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between p-2 text-sm bg-accent/10 rounded-md hover:bg-accent/20 cursor-pointer"
                    onClick={() => loadSavedResearch(job.id)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {getStatusIcon(job.status)}
                      <span className="truncate">
                        {job.focus_text 
                          ? `Focus: ${job.focus_text}` 
                          : `Research ${job.id.substring(0, 8)}`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(job.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <ProgressDisplay 
            percent={progressPercent} 
            logEntries={progress} 
            error={error}
            isLoading={isLoading}
          />
          
          {iterations.length > 0 && (
            <div className="space-y-2">
              {iterations.map((iteration) => (
                <IterationCard 
                  key={iteration.iteration}
                  iteration={iteration}
                  isExpanded={expandedIterations.includes(iteration.iteration)}
                  onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
                  isStreaming={jobStatus === 'processing' && iteration.iteration === iterations.length}
                  isCurrentIteration={iteration.iteration === iterations.length}
                  maxIterations={iterations.length}
                />
              ))}
            </div>
          )}
          
          {isAnalysisStreaming && streamingAnalysis && (
            <div className="mt-4">
              <h3 className="text-lg font-medium flex items-center gap-2 mb-2">
                <span>Final Analysis</span>
                <Badge variant="outline" className="animate-pulse bg-primary/20">Streaming</Badge>
              </h3>
              <Card className="p-2 bg-accent/5">
                <AnalysisDisplay content={streamingAnalysis} isStreaming={true} />
              </Card>
            </div>
          )}
          
          {!isAnalysisStreaming && analysis && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Final Analysis</h3>
              <Card className="p-2 bg-accent/5">
                <AnalysisDisplay content={analysis} />
              </Card>
            </div>
          )}
          
          {structuredInsights && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Key Insights</h3>
              <InsightsDisplay insights={structuredInsights} />
            </div>
          )}
          
          {results && results.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Sources</h3>
              <SitePreviewList sites={results} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
