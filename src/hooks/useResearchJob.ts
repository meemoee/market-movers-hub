import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ResearchJob, ResearchResult, StructuredInsights } from '@/types/research';
import { useToast } from '@/components/ui/use-toast';

export const useResearchJob = (marketId: string) => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [expandedIterations, setExpandedIterations] = useState<number[]>([]);
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null);
  const [structuredInsights, setStructuredInsights] = useState<any>(null);
  const [focusText, setFocusText] = useState<string>('');
  const [maxIterations, setMaxIterations] = useState<number>(3);
  const realtimeChannelRef = useRef<any>(null);
  const updateLogRef = useRef<Array<{time: number, type: string, info: string}>>([]);
  const { toast } = useToast();

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
      
      setMaxIterations(job.max_iterations);
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
    }
  };

  const calculateGoodBuyOpportunities = (probabilityStr: string, bestAsk?: number, noBestAsk?: number, bestBid?: number, outcomes?: string[]) => {
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

  const handleResearch = async (initialFocusText = '', initialMaxIterations = 3, email = '') => {
    resetState();
    setIsLoading(true);

    const useFocusText = initialFocusText || focusText;
    const notifyByEmail = email.trim() !== '';
    
    setMaxIterations(initialMaxIterations);

    try {
      logUpdate('start-research', `Starting research job with ${initialMaxIterations} iterations`);
      setProgress(prev => [...prev, "Starting research job..."]);
      
      const payload = {
        marketId,
        query: marketId, // Using marketId as query - adjust this if needed
        maxIterations: initialMaxIterations,
        focusText: useFocusText.trim() || undefined,
        notificationEmail: notifyByEmail ? email.trim() : undefined
      };
      
      logUpdate('create-job', `Creating research job with payload: marketId=${marketId}, maxIterations=${initialMaxIterations}`);
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
      setProgress(prev => [...prev, `Set to run ${initialMaxIterations} research iterations`]);
      
      subscribeToJobUpdates(newJobId);
      
      const toastMessage = notifyByEmail
        ? `Job ID: ${newJobId}. Email notification will be sent to ${email} when complete.`
        : `Job ID: ${newJobId}. You can close this window and check back later.`;
      
      toast({
        title: "Background Research Started",
        description: toastMessage,
      });
      
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

  const loadJobData = (job: ResearchJob) => {
    logUpdate('load-job', `Loading job data for job: ${job.id}, status: ${job.status}, focus: ${job.focus_text || 'none'}`);
    
    setJobId(job.id);
    setJobStatus(job.status);
    setFocusText(job.focus_text || '');
    
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      logUpdate('set-progress', `Setting progress to ${percent}% (${job.current_iteration}/${job.max_iterations})`);
      setProgressPercent(percent);
      
      setMaxIterations(job.max_iterations);
      
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
  };

  const toggleIterationExpand = (iteration: number) => {
    logUpdate('toggle-iteration', `Toggling expansion of iteration #${iteration}`);
    setExpandedIterations(prev => 
      prev.includes(iteration) 
        ? prev.filter(i => i !== iteration) 
        : [...prev, iteration]
    );
  };

  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        logUpdate('component-unmount', 'Removing realtime channel on unmount');
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  return {
    jobId,
    jobStatus,
    isLoading,
    progress,
    progressPercent,
    error,
    iterations,
    expandedIterations,
    results,
    analysis,
    structuredInsights,
    focusText,
    maxIterations,
    setFocusText,
    handleResearch,
    resetState,
    loadJobData,
    toggleIterationExpand,
  };
};
