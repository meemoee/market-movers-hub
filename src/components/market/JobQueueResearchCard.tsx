
import { useState, useEffect, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/integrations/supabase/client"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { useToast } from "@/components/ui/use-toast"
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
  const [streamingIterations, setStreamingIterations] = useState<Set<number>>(new Set())
  const [activeStreamControllers, setActiveStreamControllers] = useState<{[key: number]: AbortController}>({})
  const realtimeChannelRef = useRef<any>(null)
  const { toast } = useToast()

  const resetState = () => {
    // Close any active streams
    Object.values(activeStreamControllers).forEach(controller => {
      try {
        controller.abort();
      } catch (e) {
        console.error('Error aborting stream:', e);
      }
    });
    setActiveStreamControllers({});
    
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
    setStreamingIterations(new Set());
    
    if (realtimeChannelRef.current) {
      console.log('Removing realtime channel on reset');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }

  useEffect(() => {
    fetchSavedJobs();
    
    return () => {
      // Clean up on unmount
      Object.values(activeStreamControllers).forEach(controller => {
        try {
          controller.abort();
        } catch (e) {
          console.error('Error aborting stream on unmount:', e);
        }
      });
      
      if (realtimeChannelRef.current) {
        console.log('Removing realtime channel on unmount');
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [marketId]);

  const fetchSavedJobs = async () => {
    try {
      setIsLoadingJobs(true);
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
        setSavedJobs(data as ResearchJob[]);
      }
    } catch (e) {
      console.error('Error in fetchSavedJobs:', e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const setupAnalysisStream = (currentIteration: number, content: string, focusArea?: string) => {
    if (!content) {
      console.warn('No content to analyze');
      return;
    }
    
    console.log(`Setting up direct streaming for iteration ${currentIteration} with ${content.length} chars of content`);
    
    // Abort any existing stream for this iteration
    if (activeStreamControllers[currentIteration]) {
      try {
        activeStreamControllers[currentIteration].abort();
      } catch (e) {
        console.error(`Error aborting existing stream for iteration ${currentIteration}:`, e);
      }
    }
    
    // Create a new abort controller for this stream
    const abortController = new AbortController();
    setActiveStreamControllers(prev => ({
      ...prev,
      [currentIteration]: abortController
    }));
    
    // Update our iterations to include a streaming one
    setIterations(prev => {
      // Find if this iteration already exists
      const existingIndex = prev.findIndex(i => i.iteration === currentIteration);
      
      if (existingIndex >= 0) {
        // Update existing iteration
        const updatedIterations = [...prev];
        updatedIterations[existingIndex] = {
          ...updatedIterations[existingIndex],
          analysis: updatedIterations[existingIndex].analysis || '',
          reasoning: updatedIterations[existingIndex].reasoning || '',
          isAnalysisStreaming: true,
          isReasoningStreaming: true
        };
        return updatedIterations;
      } else {
        // Create new iteration
        return [...prev, {
          iteration: currentIteration,
          queries: [],
          results: [],
          analysis: '',
          reasoning: '',
          isAnalysisStreaming: true,
          isReasoningStreaming: true
        }];
      }
    });
    
    // Mark this iteration as streaming
    setStreamingIterations(prev => {
      const newSet = new Set(prev);
      newSet.add(currentIteration);
      return newSet;
    });
    
    // Auto-expand the streaming iteration
    if (!expandedIterations.includes(currentIteration)) {
      setExpandedIterations(prev => [...prev, currentIteration]);
    }
    
    // Set job status to processing if not already set
    if (jobStatus !== 'processing') {
      setJobStatus('processing');
    }
    
    // Send the analysis request
    const requestBody = {
      content,
      query: description,
      question: description,
      marketId,
      focusText: focusArea,
      previousAnalyses: iterations
        .filter(i => i.iteration < currentIteration && i.analysis)
        .map(i => i.analysis)
        .join('\n\n')
    };
    
    let accumulatedContent = '';
    
    try {
      const eventSource = new EventSource(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-web-content`,
        { withCredentials: true }
      );
      
      // Set up event handling
      eventSource.onopen = () => {
        console.log(`Analysis stream for iteration ${currentIteration} connected`);
        
        // Make a POST request to the same endpoint
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-web-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abortController.signal
        }).catch(error => {
          console.error(`Error making POST request for iteration ${currentIteration}:`, error);
          eventSource.close();
        });
      };
      
      eventSource.onmessage = (event) => {
        if (event.data.includes('[DONE]')) {
          console.log(`Stream complete for iteration ${currentIteration}`);
          eventSource.close();
          
          // Remove this iteration from streaming set
          setStreamingIterations(prev => {
            const newSet = new Set(prev);
            newSet.delete(currentIteration);
            return newSet;
          });
          
          // Remove abort controller
          setActiveStreamControllers(prev => {
            const updated = { ...prev };
            delete updated[currentIteration];
            return updated;
          });
          
          return;
        }
        
        try {
          // Process data from SSE
          if (event.data && event.data.trim() !== '') {
            try {
              // Check if it's a heartbeat
              if (event.data.includes('"heartbeat"')) {
                console.log('Received heartbeat');
                return;
              }
              
              const parsedData = JSON.parse(event.data);
              if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta) {
                const content = parsedData.choices[0].delta.content || '';
                if (content) {
                  accumulatedContent += content;
                  
                  // Update the analysis for this iteration
                  setIterations(prev => {
                    const updatedIterations = [...prev];
                    const iterIndex = updatedIterations.findIndex(i => i.iteration === currentIteration);
                    
                    if (iterIndex >= 0) {
                      updatedIterations[iterIndex] = {
                        ...updatedIterations[iterIndex],
                        analysis: accumulatedContent
                      };
                    }
                    
                    return updatedIterations;
                  });
                }
              }
            } catch (parseError) {
              // If not valid JSON, it might be a comment or other SSE metadata
              console.log('Non-JSON SSE data:', event.data);
            }
          }
        } catch (e) {
          console.error('Error processing event data:', e);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error(`Error in SSE connection for iteration ${currentIteration}:`, error);
        
        // Mark this iteration as no longer streaming
        setStreamingIterations(prev => {
          const newSet = new Set(prev);
          newSet.delete(currentIteration);
          return newSet;
        });
        
        // Remove abort controller
        setActiveStreamControllers(prev => {
          const updated = { ...prev };
          delete updated[currentIteration];
          return updated;
        });
        
        eventSource.close();
      };
      
      // Setup cleanup on abort
      abortController.signal.addEventListener('abort', () => {
        console.log(`Stream aborted for iteration ${currentIteration}`);
        eventSource.close();
      });
      
    } catch (error) {
      console.error(`Error setting up SSE for iteration ${currentIteration}:`, error);
      
      // Mark this iteration as no longer streaming
      setStreamingIterations(prev => {
        const newSet = new Set(prev);
        newSet.delete(currentIteration);
        return newSet;
      });
      
      // Remove abort controller
      setActiveStreamControllers(prev => {
        const updated = { ...prev };
        delete updated[currentIteration];
        return updated;
      });
    }
  };

  const subscribeToJobUpdates = (id: string) => {
    if (realtimeChannelRef.current) {
      console.log('Removing existing realtime channel before creating new one');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    
    console.log(`Setting up realtime subscription for job id: ${id}`);
    
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
          console.log('Received realtime update:', payload);
          handleJobUpdate(payload.new as ResearchJob);
        }
      )
      .subscribe((status) => {
        console.log(`Realtime subscription status: ${status}`, id);
      });
    
    realtimeChannelRef.current = channel;
  };

  const detectStreamingIterations = (job: ResearchJob) => {
    if (job.status !== 'processing' || job.current_iteration <= 0) {
      return new Set<number>();
    }
    
    const streamingSet = new Set<number>();
    const currentIteration = job.current_iteration;
    
    if (job.iterations && Array.isArray(job.iterations)) {
      if (job.iterations.length >= currentIteration) {
        streamingSet.add(currentIteration);
        console.log(`Detected streaming iteration: ${currentIteration}`);
      }
    }
    
    return streamingSet;
  };

  const handleJobUpdate = (job: ResearchJob) => {
    console.log('Processing job update:', job);
    
    setJobStatus(job.status);
    
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(job.status === 'completed' ? 100 : percent);
    }
    
    if (job.progress_log && Array.isArray(job.progress_log)) {
      const currentProgress = progress;
      const newItems = job.progress_log.slice(currentProgress.length);
      
      if (newItems.length > 0) {
        console.log('Adding new progress items:', newItems);
        setProgress(prev => [...prev, ...newItems]);
      }
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      // Handle the case where we have web scrape results but no analysis yet
      // We'll initiate the analysis stream for the current iteration
      if (job.status === 'processing' && 
          job.current_iteration > 0 && 
          job.iterations[job.current_iteration - 1] && 
          job.iterations[job.current_iteration - 1].results && 
          job.iterations[job.current_iteration - 1].results.length > 0 &&
          (!job.iterations[job.current_iteration - 1].analysis || 
           job.iterations[job.current_iteration - 1].analysis.trim() === '')) {
        
        const currentIter = job.current_iteration;
        const iterData = job.iterations[currentIter - 1];
        
        console.log(`Starting analysis stream for iteration ${currentIter} which has results but no analysis`);
        
        // Prepare content from the results
        const content = iterData.results
          .map((r: ResearchResult) => `Source: ${r.url}\n${r.content}\n\n`)
          .join('\n');
        
        // Start the analysis stream
        if (content && content.trim() !== '') {
          setupAnalysisStream(currentIter, content, job.focus_text);
        }
      }
      
      console.log('Received iterations with reasoning data:', job.iterations);
      
      const newStreamingIterations = job.status === 'processing' 
        ? detectStreamingIterations(job) 
        : new Set<number>();
        
      setStreamingIterations(newStreamingIterations);
      
      const enhancedIterations = job.iterations.map(iter => ({
        ...iter,
        isAnalysisStreaming: newStreamingIterations.has(iter.iteration),
        isReasoningStreaming: newStreamingIterations.has(iter.iteration)
      }));
      
      setIterations(enhancedIterations);
      
      if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
        setExpandedIterations(prev => [...prev, job.current_iteration]);
      }
    }
    
    if (job.status === 'completed' && job.results) {
      try {
        console.log('Processing completed job results:', job.results);
        
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
          } catch (parseError) {
            console.error('Error parsing job.results string:', parseError);
            throw new Error('Invalid results format (string parsing failed)');
          }
        } else if (typeof job.results === 'object') {
          parsedResults = job.results;
        } else {
          throw new Error(`Unexpected results type: ${typeof job.results}`);
        }
        
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          setResults(parsedResults.data);
        }
        
        if (parsedResults.analysis) {
          setAnalysis(parsedResults.analysis);
        }
        
        if (parsedResults.structuredInsights) {
          console.log('Found structuredInsights:', parsedResults.structuredInsights);
          
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
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
        
        setStreamingIterations(new Set());
        
        fetchSavedJobs();
      } catch (e) {
        console.error('Error processing job results:', e);
      }
    }
    
    if (job.status === 'failed') {
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
      setProgress(prev => [...prev, `Job failed: ${job.error_message || 'Unknown error'}`]);
      
      setStreamingIterations(new Set());
      
      fetchSavedJobs();
    }
  };

  const loadJobData = (job: ResearchJob) => {
    setJobId(job.id);
    setJobStatus(job.status);
    
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(percent);
      
      if (job.status === 'completed') {
        setProgressPercent(100);
      }
    }
    
    if (job.progress_log && Array.isArray(job.progress_log)) {
      setProgress(job.progress_log);
    }
    
    const newStreamingIterations = job.status === 'processing' 
      ? detectStreamingIterations(job) 
      : new Set<number>();
      
    setStreamingIterations(newStreamingIterations);
    
    if (job.status === 'queued' || job.status === 'processing') {
      subscribeToJobUpdates(job.id);
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      const enhancedIterations = job.iterations.map(iter => ({
        ...iter,
        isAnalysisStreaming: newStreamingIterations.has(iter.iteration),
        isReasoningStreaming: newStreamingIterations.has(iter.iteration)
      }));
      
      setIterations(enhancedIterations);
      
      if (job.iterations.length > 0) {
        setExpandedIterations([job.iterations.length]);
      }
    }
    
    if (job.status === 'completed' && job.results) {
      try {
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
          } catch (parseError) {
            console.error('Error parsing job.results string in loadJobData:', parseError);
            throw new Error('Invalid results format (string parsing failed)');
          }
        } else if (typeof job.results === 'object') {
          parsedResults = job.results;
        } else {
          throw new Error(`Unexpected results type: ${typeof job.results}`);
        }
        
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          setResults(parsedResults.data);
        }
        if (parsedResults.analysis) {
          setAnalysis(parsedResults.analysis);
        }
        if (parsedResults.structuredInsights) {
          console.log('Found structuredInsights in loadJobData:', parsedResults.structuredInsights);
          
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
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
        console.error('Error processing loaded job results:', e);
      }
    }
    
    if (job.status === 'failed') {
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
    }

    if (job.focus_text) {
      setFocusText(job.focus_text);
    }
  }

  const calculateGoodBuyOpportunities = (probabilityStr: string) => {
    if (!probabilityStr || !bestAsk || !outcomes || outcomes.length < 2) {
      return null;
    }

    const probability = parseInt(probabilityStr.replace('%', '').trim()) / 100;
    if (isNaN(probability)) {
      return null;
    }
    
    const THRESHOLD = 0.05;
    
    const opportunities = [];
    
    if (probability > bestAsk + THRESHOLD) {
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
      setProgress(prev => [...prev, "Starting research job..."]);
      
      const payload = {
        marketId,
        query: description,
        maxIterations: numIterations,
        focusText: useFocusText.trim() || undefined,
        notificationEmail: notifyByEmail && notificationEmail.trim() ? notificationEmail.trim() : undefined,
        directStreaming: true // Signal that we want to use direct streaming
      };
      
      console.log('Creating research job with payload:', payload);
      
      const response = await supabase.functions.invoke('create-research-job', {
        body: JSON.stringify(payload)
      });
      
      if (response.error) {
        console.error("Error creating research job:", response.error);
        throw new Error(`Error creating research job: ${response.error.message}`);
      }
      
      if (!response.data || !response.data.jobId) {
        throw new Error("Invalid response from server - no job ID returned");
      }
      
      const jobId = response.data.jobId;
      console.log(`Research job created with ID: ${jobId}`);
      
      setJobId(jobId);
      setJobStatus('queued');
      setProgress(prev => [...prev, `Research job created with ID: ${jobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      setProgress(prev => [...prev, `Set to run ${numIterations} research iterations`]);
      
      subscribeToJobUpdates(jobId);
      
      const toastMessage = notifyByEmail && notificationEmail.trim() 
        ? `Job ID: ${jobId}. Email notification will be sent to ${notificationEmail} when complete.`
        : `Job ID: ${jobId}. You can close this window and check back later.`;
      
      toast({
        title: "Background Research Started",
        description: toastMessage,
      });
      
      fetchSavedJobs();
      
    } catch (error) {
      console.error('Error in research job:', error);
      setError(`Error occurred during research job: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setJobStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIterationExpand = (iteration: number) => {
    setExpandedIterations(prev => 
      prev.includes(iteration) 
        ? prev.filter(i => i !== iteration) 
        : [...prev, iteration]
    );
  };

  const loadSavedResearch = async (jobId: string) => {
    try {
      setIsLoadingSaved(true);
      
      resetState();
      
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
        setIsLoadingSaved(false);
        return;
      }
      
      if (!data) {
        toast({
          title: "Error",
          description: "Research job not found.",
          variant: "destructive"
        });
        setIsLoadingSaved(false);
        return;
      }
      
      const job = data as ResearchJob;
      console.log('Loaded research job:', job);
      
      loadJobData(job);
      
      toast({
        title: "Research Loaded",
        description: `Loaded research job ${job.focus_text ? `focused on: ${job.focus_text}` : ''}`,
      });
    } catch (e) {
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

  const handleStreamEnd = () => {
    console.log('Stream ended, updating UI');
    // This function is just a placeholder for additional UI updates if needed
  };

  const handleResearchArea = (area: string) => {
    setFocusText('');
    
    toast({
      title: "Starting Focused Research",
      description: `Creating new research job focused on: ${area}`,
    });
    
    handleResearch(area);
  };

  const handleClearDisplay = () => {
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
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span>History</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-auto">
                {isLoadingJobs ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  savedJobs.map(job => (
                    <DropdownMenuItem 
                      key={job.id}
                      className="cursor-pointer py-3 px-4 hover:bg-accent"
                      onClick={() => loadSavedResearch(job.id)}
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center">
                            {getStatusIcon(job.status)}
                            <span className="font-medium">
                              {job.focus_text ? 
                                (job.focus_text.length > 30 ? 
                                  job.focus_text.substring(0, 30) + '...' : 
                                  job.focus_text) : 
                                'General research'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(job.created_at)}
                          </span>
                        </div>
                        
                        {job.status === 'completed' && (
                          <div className="mt-1 text-xs text-muted-foreground flex items-center">
                            <span>Probability: </span>
                            <span className="ml-1 font-medium">
                              {extractProbability(job) || 'Not available'}
                            </span>
                          </div>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!jobId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span>Options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="iterations">Max iterations</Label>
                    <Select value={maxIterations} onValueChange={setMaxIterations}>
                      <SelectTrigger id="iterations">
                        <SelectValue placeholder="Select iterations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 iteration</SelectItem>
                        <SelectItem value="2">2 iterations</SelectItem>
                        <SelectItem value="3">3 iterations</SelectItem>
                        <SelectItem value="4">4 iterations</SelectItem>
                        <SelectItem value="5">5 iterations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="notify-email" 
                        checked={notifyByEmail}
                        onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
                      />
                      <Label htmlFor="notify-email" className="cursor-pointer">
                        <div className="flex items-center gap-1">
                          <Mail className="h-4 w-4" />
                          <span>Notify by email</span>
                        </div>
                      </Label>
                    </div>
                    
                    {notifyByEmail && (
                      <Input
                        id="email"
                        type="email"
                        placeholder="Email address"
                        value={notificationEmail}
                        onChange={(e) => setNotificationEmail(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      
      {!jobId && !isLoading && (
        <div>
          <div className="space-y-2">
            <Label htmlFor="focus-text">Focus area (optional)</Label>
            <Input
              id="focus-text"
              placeholder="Focus research on a specific aspect..."
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Add specific instructions to guide the research agent.
            </p>
          </div>
        </div>
      )}
      
      {(isLoading || progress.length > 0 || jobStatus) && (
        <ProgressDisplay 
          messages={progress}
          jobId={jobId || undefined}
          progress={progressPercent}
          status={jobStatus}
        />
      )}
      
      {error && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-700 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div className="font-semibold">Error</div>
          </div>
          <div className="mt-1">{error}</div>
        </div>
      )}
      
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Research Results</h3>
          <SitePreviewList results={results} />
        </div>
      )}
      
      {iterations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Research Iterations</h3>
          <div className="space-y-2">
            {iterations.map((iteration, index) => (
              <IterationCard 
                key={`iteration-${iteration.iteration}`}
                iteration={iteration}
                isExpanded={expandedIterations.includes(iteration.iteration)}
                onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
                onStreamEnd={handleStreamEnd}
              />
            ))}
          </div>
        </div>
      )}
      
      {analysis && (
        <AnalysisDisplay analysis={analysis} />
      )}
      
      {structuredInsights && structuredInsights.parsedData && (
        <InsightsDisplay 
          data={structuredInsights.parsedData}
          rawJson={structuredInsights.rawText}
        />
      )}
    </Card>
  );
}
