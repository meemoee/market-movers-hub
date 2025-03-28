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
  const [directStreamingIteration, setDirectStreamingIteration] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const realtimeChannelRef = useRef<any>(null)
  const { toast } = useToast()

  const resetState = () => {
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
      // Abort any active streams
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
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

  // New function to handle direct streaming from the proxy edge function
  const startDirectStreaming = async (iterationNumber: number) => {
    // Only one stream at a time
    if (directStreamingIteration !== null) {
      console.log(`Already streaming iteration ${directStreamingIteration}, ignoring request for ${iterationNumber}`);
      return;
    }
    
    if (!jobId) {
      console.error('Cannot start direct streaming without a job ID');
      return;
    }
    
    try {
      console.log(`Starting direct streaming for iteration ${iterationNumber}`);
      setDirectStreamingIteration(iterationNumber);
      
      // Create an abort controller to cancel the stream if needed
      abortControllerRef.current = new AbortController();
      
      // Update the iteration object to indicate streaming is starting
      const updatedIterations = iterations.map(iter => {
        if (iter.iteration === iterationNumber) {
          return {
            ...iter,
            streamStatus: 'streaming',
            isAnalysisStreaming: true,
            isReasoningStreaming: true
          };
        }
        return iter;
      });
      setIterations(updatedIterations);
      
      // Start the streaming request
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-analysis-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          jobId,
          iteration: iterationNumber
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`Stream request failed with status ${response.status}`);
      }
      
      // Process the stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }
      
      // Keep track of accumulated content for this streaming session
      let streamedAnalysis = '';
      let streamedReasoning = '';
      
      // Process chunks as they arrive
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream completed naturally');
          break;
        }
        
        // Decode the chunk
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonData = JSON.parse(line.substring(6));
              
              // Handle different types of messages
              if (jsonData.type === 'analysis' && jsonData.content) {
                streamedAnalysis += jsonData.content;
                
                // Update the iterations state with the latest content
                setIterations(current => 
                  current.map(iter => {
                    if (iter.iteration === iterationNumber) {
                      return {
                        ...iter,
                        analysis: (iter.analysis || '') + jsonData.content,
                        isAnalysisStreaming: true
                      };
                    }
                    return iter;
                  })
                );
              } 
              else if (jsonData.type === 'reasoning' && jsonData.content) {
                streamedReasoning += jsonData.content;
                
                // Update the iterations state with the latest reasoning
                setIterations(current => 
                  current.map(iter => {
                    if (iter.iteration === iterationNumber) {
                      return {
                        ...iter,
                        reasoning: (iter.reasoning || '') + jsonData.content,
                        isReasoningStreaming: true
                      };
                    }
                    return iter;
                  })
                );
              }
              else if (jsonData.type === 'complete') {
                console.log('Received completion signal from stream');
                // Set the iteration as complete
                setIterations(current => 
                  current.map(iter => {
                    if (iter.iteration === iterationNumber) {
                      return {
                        ...iter,
                        isAnalysisStreaming: false,
                        isReasoningStreaming: false,
                        streamStatus: 'complete'
                      };
                    }
                    return iter;
                  })
                );
              }
              else if (jsonData.error) {
                console.error('Stream error:', jsonData.error);
                setError(`Streaming error: ${jsonData.error}`);
                break;
              }
            } catch (e) {
              console.error('Error parsing stream data:', e, 'Raw data:', line);
            }
          }
        }
      }
      
      // Final update to mark streaming as complete
      setIterations(current => 
        current.map(iter => {
          if (iter.iteration === iterationNumber) {
            return {
              ...iter,
              isAnalysisStreaming: false,
              isReasoningStreaming: false,
              streamStatus: 'complete'
            };
          }
          return iter;
        })
      );
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Stream was aborted');
      } else {
        console.error('Error in direct streaming:', error);
        setError(`Error during streaming: ${error.message}`);
      }
    } finally {
      setDirectStreamingIteration(null);
      abortControllerRef.current = null;
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
      console.log('Received iterations update:', job.iterations);
      
      // Detect which iterations are ready for streaming
      const streamingSet = new Set<number>();
      const waitingForStreamSet = new Set<number>();
      
      if (job.status === 'processing' && job.current_iteration > 0) {
        // The current iteration is the one that should be ready for streaming
        // Check if it has results but not yet analysis
        const currentIter = job.iterations.find(iter => iter.iteration === job.current_iteration);
        if (currentIter && currentIter.results && currentIter.results.length > 0 && !currentIter.analysis) {
          waitingForStreamSet.add(job.current_iteration);
        }
      }
      
      // Enhance iterations with streaming status
      const enhancedIterations = job.iterations.map(iter => {
        const isCurrentlyStreaming = directStreamingIteration === iter.iteration;
        const isWaitingForStream = waitingForStreamSet.has(iter.iteration);
        
        return {
          ...iter,
          // Only mark as streaming if we're directly streaming this iteration
          isAnalysisStreaming: isCurrentlyStreaming,
          isReasoningStreaming: isCurrentlyStreaming,
          // Add stream status property
          streamStatus: isCurrentlyStreaming ? 'streaming' : 
                        isWaitingForStream ? 'waiting' : 
                        'complete'
        };
      });
      
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
        notificationEmail: notifyByEmail && notificationEmail.trim() ? notificationEmail.trim() : undefined
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
                isStreaming={iteration.streamStatus === 'streaming' || 
                             streamingIterations.has(iteration.iteration)}
                isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                maxIterations={parseInt(maxIterations, 10)}
                onStartStream={startDirectStreaming}
              />
            ))}
          </div>
        </div>
      )}
      
      {structuredInsights && structuredInsights.parsedData && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Research Insights</h3>
          <InsightsDisplay 
            streamingState={structuredInsights} 
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
      
      {results.length > 0 && (
        <>
          <div className="border-t pt-4 w-full max-w-full">
            <h3 className="text-lg font-medium mb-2">Search Results</h3>
            <SitePreviewList results={results} />
          </div>
          
          {analysis && (
            <div className="border-t pt-4 w-full max-w-full">
              <h3 className="text-lg font-medium mb-2">Final Analysis</h3>
              <AnalysisDisplay content={analysis} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
