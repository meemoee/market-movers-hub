import { useState, useEffect, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/integrations/supabase/client"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
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
  const [jobId, setJobId] = useState<string | null>(null)
  const [iterations, setIterations] = useState<any[]>([])
  const [expandedIterations, setExpandedIterations] = useState<number[]>([])
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [structuredInsights, setStructuredInsights] = useState<any>(null)
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([])
  const [streamingIterationNumber, setStreamingIterationNumber] = useState<number | null>(null)
  const [streamedAnalysisContent, setStreamedAnalysisContent] = useState<string>("")
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [notifyByEmail, setNotifyByEmail] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [maxIterations, setMaxIterations] = useState<string>("3")
  const jobUpdateChannelRef = useRef<any>(null) // Renamed for clarity
  const analysisStreamChannelRef = useRef<any>(null) // For analysis chunks
  const { toast } = useToast()

  const resetState = () => {
    setJobId(null);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setError(null);
    setIterations([]);
    setExpandedIterations([]);
    setJobStatus(null);
    setStructuredInsights(null);
    setStreamingIterationNumber(null);
    setStreamedAnalysisContent("");
    
    if (jobUpdateChannelRef.current) {
      console.log('Removing job update channel on reset');
      supabase.removeChannel(jobUpdateChannelRef.current);
      jobUpdateChannelRef.current = null;
    }
    if (analysisStreamChannelRef.current) {
      console.log('Removing analysis stream channel on reset');
      supabase.removeChannel(analysisStreamChannelRef.current);
      analysisStreamChannelRef.current = null;
    }
  }

  useEffect(() => {
    fetchSavedJobs();
    
    // Cleanup function to remove both channels on unmount
    return () => {
      if (jobUpdateChannelRef.current) {
        console.log('Removing job update channel on unmount');
        supabase.removeChannel(jobUpdateChannelRef.current);
        jobUpdateChannelRef.current = null;
      }
      if (analysisStreamChannelRef.current) {
        console.log('Removing analysis stream channel on unmount');
        supabase.removeChannel(analysisStreamChannelRef.current);
        analysisStreamChannelRef.current = null;
      }
    };
  }, [marketId]); // Keep dependency array minimal

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
  
  // Function to unsubscribe from the analysis stream channel
  const unsubscribeFromAnalysisStream = () => {
    if (analysisStreamChannelRef.current) {
      console.log(`Unsubscribing from analysis stream channel: ${analysisStreamChannelRef.current.channelName}`);
      supabase.removeChannel(analysisStreamChannelRef.current);
      analysisStreamChannelRef.current = null;
      setStreamingIterationNumber(null); // Clear the streaming iteration number
      // Keep streamedAnalysisContent as is, it will be replaced by final data later
    }
  };

  // Subscribe to main job updates (status, progress, final results)
  const subscribeToJobUpdates = (id: string) => {
    if (jobUpdateChannelRef.current) {
      console.log('Removing existing job update channel before creating new one');
      supabase.removeChannel(jobUpdateChannelRef.current);
      jobUpdateChannelRef.current = null;
    }
    
    console.log(`Setting up job update subscription for job id: ${id}`);
    
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
          console.log('Received job update:', payload);
          handleJobUpdate(payload.new as ResearchJob);
        }
      )
      .subscribe((status) => {
        console.log(`Job update subscription status: ${status}`, id);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Job update subscription failed for job ${id}: ${status}`);
          // Optionally handle subscription failure (e.g., show error, retry)
        }
      });
    
    jobUpdateChannelRef.current = channel;
  };
  
  // Subscribe to analysis stream chunks for a specific iteration
  const subscribeToAnalysisStream = (jobId: string, iterationNumber: number) => {
    // Unsubscribe from any previous stream channel first
    unsubscribeFromAnalysisStream();
    
    const channelName = `analysis-stream-${jobId}-${iterationNumber}`;
    console.log(`Setting up analysis stream subscription for: ${channelName}`);
    
    setStreamingIterationNumber(iterationNumber); // Mark this iteration as streaming
    setStreamedAnalysisContent(""); // Reset content for the new stream
    
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'analysis_chunk' }, (message) => {
        // console.log('Received analysis chunk:', message.payload);
        if (message.payload && typeof message.payload.chunk === 'string') {
          setStreamedAnalysisContent(prev => prev + message.payload.chunk);
        }
      })
      .subscribe((status) => {
        console.log(`Analysis stream subscription status: ${status}`, channelName);
        if (status === 'SUBSCRIBED') {
          console.log(`Successfully subscribed to ${channelName}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Analysis stream subscription failed for ${channelName}: ${status}`);
          // Handle subscription failure if necessary
          unsubscribeFromAnalysisStream(); // Clean up on failure
        }
      });
      
    analysisStreamChannelRef.current = channel;
  };

  // Process updates received from the main job update channel
  const handleJobUpdate = (job: ResearchJob) => {
    console.log('Processing job update:', job);
    
    const previousStatus = jobStatus;
    setJobStatus(job.status);
    
    // Handle progress percentage
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(job.status === 'completed' ? 100 : percent);
    }
    
    // Handle progress log updates
    if (job.progress_log && Array.isArray(job.progress_log)) {
      // Use functional update to avoid stale state issues if updates arrive quickly
      setProgress(prevProgress => {
        const newItems = job.progress_log.slice(prevProgress.length);
        if (newItems.length > 0) {
          console.log('Adding new progress items:', newItems);
          return [...prevProgress, ...newItems];
        }
        return prevProgress;
      });
    }
    
    // Handle iteration data updates (contains final analysis after stream)
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations); // Update with the latest full iteration data
      
      // Auto-expand the latest iteration if it's new
      if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
        setExpandedIterations(prev => [...prev, job.current_iteration]);
      }
      
      // Check if the currently streaming iteration has received its final analysis
      const currentStreamingIter = job.iterations.find(iter => iter.iteration === streamingIterationNumber);
      if (currentStreamingIter && currentStreamingIter.analysis && currentStreamingIter.analysis.length > 0) {
        // If the final analysis is now present in the main job data for the iteration
        // that was streaming, we can stop listening to the chunk stream for it.
        console.log(`Iteration ${streamingIterationNumber} received final analysis. Unsubscribing from chunk stream.`);
        unsubscribeFromAnalysisStream(); 
      }
    }
    
    // --- Handle starting/stopping the analysis chunk stream subscription ---
    if (job.status === 'processing' && job.current_iteration > 0) {
      // If the job is processing and the current_iteration has changed or we weren't streaming before
      if (job.current_iteration !== streamingIterationNumber) {
        console.log(`Job processing iteration ${job.current_iteration}. Subscribing to analysis stream.`);
        subscribeToAnalysisStream(job.id, job.current_iteration);
      }
    } else if (job.status === 'completed' || job.status === 'failed') {
      // If job finished or failed, ensure we unsubscribe from any active stream
      if (streamingIterationNumber !== null) {
        console.log(`Job status is ${job.status}. Unsubscribing from analysis stream.`);
        unsubscribeFromAnalysisStream();
      }
    }
    // --- End stream subscription handling ---
    
    // Handle final results processing (when job completes)
    if (job.status === 'completed' && job.results && previousStatus !== 'completed') {
      try {
        console.log('Processing final completed job results:', job.results);
        
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
          } catch (parseError) {
            console.error('Error parsing final job.results string:', parseError);
            // Don't throw, just log and potentially skip results processing
            setError("Error parsing final results data.");
            parsedResults = null; // Indicate parsing failure
          }
        } else if (typeof job.results === 'object' && job.results !== null) {
          parsedResults = job.results;
        } else {
          console.error('Unexpected final results type in handleJobUpdate:', typeof job.results);
          setError("Received unexpected final results format.");
          parsedResults = null; // Indicate format issue
        }
        
        if (parsedResults) { // Only process if parsing was successful
          if (parsedResults.data && Array.isArray(parsedResults.data)) {
            setResults(parsedResults.data);
          }
          
          if (parsedResults.structuredInsights) {
            console.log('Found final structuredInsights:', parsedResults.structuredInsights);
            
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
        }
        fetchSavedJobs(); // Refresh history list
      } catch (e) {
        console.error('Error processing final job results:', e);
        setError(`Error processing final results: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
    
    // Handle job failure
    if (job.status === 'failed' && previousStatus !== 'failed') {
      const errorMsg = `Job failed: ${job.error_message || 'Unknown error'}`;
      setError(errorMsg);
      // Use functional update for progress
      setProgress(prev => {
        // Avoid adding duplicate failure messages
        if (prev[prev.length - 1] !== errorMsg) {
          return [...prev, errorMsg];
        }
        return prev;
      });
      
      fetchSavedJobs(); // Refresh history list
    }
  };

  // Load data for a selected job (from history or initial load)
  const loadJobData = (job: ResearchJob) => {
    resetState(); // Ensure clean state before loading
    setJobId(job.id);
    setJobStatus(job.status);
    
    // Set progress percentage
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(job.status === 'completed' ? 100 : percent);
    }
    
    // Set initial progress log
    if (job.progress_log && Array.isArray(job.progress_log)) {
      setProgress(job.progress_log);
    }
    
    // Set iterations data (contains final analysis for completed iterations)
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations);
      // Auto-expand the last known iteration
      if (job.iterations.length > 0) {
        setExpandedIterations([job.iterations.length]); 
      }
    }
    
    // Subscribe to updates if the job is still active
    if (job.status === 'queued' || job.status === 'processing') {
      subscribeToJobUpdates(job.id);
      // If processing, also try to subscribe to the current iteration's stream
      if (job.status === 'processing' && job.current_iteration > 0) {
        // Check if the analysis for the current iteration is already complete in the loaded data
        const currentIterData = job.iterations?.find(iter => iter.iteration === job.current_iteration);
        if (!currentIterData || !currentIterData.analysis) {
          console.log(`Loading active job, subscribing to analysis stream for iteration ${job.current_iteration}`);
          subscribeToAnalysisStream(job.id, job.current_iteration);
        } else {
          console.log(`Loading active job, iteration ${job.current_iteration} analysis already complete.`);
        }
      }
    }
    
    // Process results if the job is completed
    if (job.status === 'completed' && job.results) {
      try {
        console.log('Processing loaded completed job results:', job.results);
        let parsedResults;
        if (typeof job.results === 'string') {
          try {
            parsedResults = JSON.parse(job.results);
          } catch (parseError) {
            console.error('Error parsing loaded job.results string:', parseError);
            setError("Error parsing loaded results data.");
            parsedResults = null;
          }
        } else if (typeof job.results === 'object' && job.results !== null) {
          parsedResults = job.results;
        } else {
          console.error('Unexpected loaded results type:', typeof job.results);
          setError("Received unexpected loaded results format.");
          parsedResults = null;
        }
        
        if (parsedResults) {
          if (parsedResults.data && Array.isArray(parsedResults.data)) {
            setResults(parsedResults.data);
          }
          if (parsedResults.structuredInsights) {
            console.log('Found loaded structuredInsights:', parsedResults.structuredInsights);
            
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
        }
      } catch (e) {
        console.error('Error processing loaded completed job results:', e);
        setError(`Error processing loaded results: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
    
    // Set error if job failed
    if (job.status === 'failed') {
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
    }

    // Set focus text if present
    if (job.focus_text) {
      setFocusText(job.focus_text);
    }
  }

  // Helper function to calculate buy opportunities
  const calculateGoodBuyOpportunities = (probabilityStr: string) => {
    // Ensure necessary market data is available
    if (!probabilityStr || bestAsk === undefined || !outcomes || outcomes.length < 2) {
      return null;
    }

    // Parse probability, handling potential '%' sign and whitespace
    const probability = parseFloat(probabilityStr.replace('%', '').trim()) / 100;
    if (isNaN(probability)) {
      console.warn(`Could not parse probability: ${probabilityStr}`);
      return null;
    }
    
    const THRESHOLD = 0.05; // Minimum difference threshold
    
    const opportunities = [];
    
    // Check 'YES' opportunity
    if (probability > bestAsk + THRESHOLD) {
      opportunities.push({
        outcome: outcomes[0], // Assumes first outcome is 'YES'
        predictedProbability: probability,
        marketPrice: bestAsk,
        difference: (probability - bestAsk)
      });
    }
    
    // Check 'NO' opportunity
    const inferredNoProbability = 1 - probability;
    // Calculate 'NO' ask price: use noBestAsk if available, otherwise infer from bestBid
    const noAskPrice = noBestAsk !== undefined ? noBestAsk : (bestBid !== undefined ? 1 - bestBid : undefined);
    
    if (noAskPrice !== undefined && inferredNoProbability > noAskPrice + THRESHOLD) {
      opportunities.push({
        outcome: outcomes[1] || "NO", // Assumes second outcome is 'NO'
        predictedProbability: inferredNoProbability,
        marketPrice: noAskPrice,
        difference: (inferredNoProbability - noAskPrice)
      });
    }
    
    // Return opportunities sorted by difference, or null if none found
    return opportunities.length > 0 
      ? opportunities.sort((a, b) => b.difference - a.difference) 
      : null;
  };

  // Helper function to extract probability from job results (used for history display)
  const extractProbability = (job: ResearchJob): string | null => {
    // Only attempt extraction if job is completed and has results
    if (job.status !== 'completed' || !job.results) return null;
    
    try {
      let parsedResults;
      if (typeof job.results === 'string') {
        try {
          parsedResults = JSON.parse(job.results);
        } catch (parseError) {
          console.warn('Error parsing job.results string in extractProbability:', parseError);
          return null; // Don't throw, just return null
        }
      } else if (typeof job.results === 'object' && job.results !== null) {
        parsedResults = job.results;
      } else {
        console.warn('Unexpected results type in extractProbability:', typeof job.results);
        return null;
      }
      
      // Safely access nested property
      return parsedResults?.structuredInsights?.probability || null;
      
    } catch (e) {
      console.error('Error extracting probability from job results:', e);
      return null;
    }
  };

  // Start a new research job
  const handleResearch = async (initialFocusText = '') => {
    resetState(); // Clear previous job state
    setIsLoading(true); // Set loading indicator

    const useFocusText = initialFocusText || focusText; // Use provided focus or state
    const numIterations = parseInt(maxIterations, 10); // Parse iteration count

    try {
      // Initial progress message
      setProgress(["Starting research job..."]); // Reset progress log
      
      // Prepare payload for the backend function
      const payload = {
        marketId,
        query: description, // Use market description as the base query
        maxIterations: numIterations,
        focusText: useFocusText.trim() || undefined, // Include focus text if provided
        notificationEmail: notifyByEmail && notificationEmail.trim() ? notificationEmail.trim() : undefined // Include email if requested
      };
      
      console.log('Invoking create-research-job function with payload:', payload);
      
      // Call the Supabase Edge Function
      const { data: responseData, error: functionError } = await supabase.functions.invoke('create-research-job', {
        body: JSON.stringify(payload) // Send payload as JSON string
      });
      
      // Handle function invocation errors
      if (functionError) {
        console.error("Error invoking create-research-job function:", functionError);
        throw new Error(`Function invocation failed: ${functionError.message}`);
      }
      
      // Validate response data
      if (!responseData || !responseData.jobId) {
        console.error("Invalid response from create-research-job:", responseData);
        throw new Error("Invalid response from server - no job ID returned");
      }
      
      const newJobId = responseData.jobId;
      console.log(`Research job created successfully with ID: ${newJobId}`);
      
      // Update state with the new job ID and initial status/progress
      setJobId(newJobId);
      setJobStatus('queued'); // Initial status
      setProgress(prev => [...prev, `Research job created with ID: ${newJobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      setProgress(prev => [...prev, `Set to run ${numIterations} research iterations`]);
      
      // Subscribe to updates for the newly created job
      subscribeToJobUpdates(newJobId);
      
      // Show toast notification
      const toastMessage = notifyByEmail && notificationEmail.trim() 
        ? `Job ID: ${newJobId}. Email notification will be sent to ${notificationEmail} when complete.`
        : `Job ID: ${newJobId}. You can close this window and check back later.`;
      
      toast({
        title: "Background Research Started",
        description: toastMessage,
      });
      
      fetchSavedJobs(); // Refresh the history list
      
    } catch (error) {
      // Catch errors during the process
      console.error('Error starting research job:', error);
      const errorMsg = `Error starting research job: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setError(errorMsg);
      setProgress(prev => [...prev, errorMsg]); // Add error to progress log
      setJobStatus('failed'); // Set status to failed
    } finally {
      setIsLoading(false); // Ensure loading indicator is turned off
    }
  };

  // Toggle the expanded state of an iteration card
  const toggleIterationExpand = (iterationNumber: number) => {
    setExpandedIterations(prev => 
      prev.includes(iterationNumber) 
        ? prev.filter(i => i !== iterationNumber) // Collapse if already expanded
        : [...prev, iterationNumber] // Expand if collapsed
    );
  };

  // Load a specific research job from history
  const loadSavedResearch = async (jobIdToLoad: string) => {
    // Prevent loading if already loading or processing another job
    if (isLoading || isLoadingSaved || isLoadingJobs) return; 
    
    try {
      setIsLoadingSaved(true); // Set loading indicator
      
      // Fetch the specific job data
      const { data, error: fetchError } = await supabase
        .from('research_jobs')
        .select('*') // Select all columns
        .eq('id', jobIdToLoad) // Filter by job ID
        .single(); // Expect only one result
        
      // Handle fetch errors
      if (fetchError) {
        console.error('Error loading saved research:', fetchError);
        toast({
          title: "Error Loading Research",
          description: `Failed to load job ${jobIdToLoad}. ${fetchError.message}`,
          variant: "destructive"
        });
        return; // Exit if fetch failed
      }
      
      // Handle case where job is not found
      if (!data) {
        toast({
          title: "Research Not Found",
          description: `Research job with ID ${jobIdToLoad} was not found.`,
          variant: "destructive"
        });
        return; // Exit if job not found
      }
      
      // Cast data and load it
      const jobToLoad = data as ResearchJob;
      console.log('Loading research job from history:', jobToLoad);
      loadJobData(jobToLoad); // Use the dedicated function to load state
      
      // Success toast
      toast({
        title: "Research Loaded",
        description: `Loaded research job ${jobToLoad.focus_text ? `focused on: ${jobToLoad.focus_text}` : ''}`,
      });
      
    } catch (e) {
      // Catch unexpected errors
      console.error('Unexpected error loading saved research:', e);
      toast({ // Fix: Correctly call toast
        title: "Loading Error",
        description: `An unexpected error occurred: ${e instanceof Error ? e.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally { // Fix: Added missing closing brace for catch block above
      setIsLoadingSaved(false); // Ensure loading indicator is turned off
    }
  };

  // Start a new research job focused on a specific area suggested by insights
  const handleResearchArea = (area: string) => {
    // Reset focus text and start a new job with the suggested area as focus
    setFocusText(''); // Clear any existing focus text in the input
    
    toast({
      title: "Starting Focused Research",
      description: `Creating new research job focused on: ${area}`,
    });
    
    handleResearch(area); // Call handleResearch with the area as initialFocusText
  };

  // Clear the current display and prepare for a new research job
  const handleClearDisplay = () => {
    resetState(); // Reset all job-related state
    setFocusText(''); // Clear the focus text input
  };

  // Render the status badge based on the current jobStatus
  const renderStatusBadge = () => {
    if (!jobStatus) return null; // Don't render if no status
    
    const statusConfig = {
      queued: { icon: Clock, text: "Queued", color: "yellow" },
      processing: { icon: Loader2, text: "Processing", color: "blue", animate: true },
      completed: { icon: CheckCircle, text: "Completed", color: "green" },
      failed: { icon: AlertCircle, text: "Failed", color: "red" },
    };
    
    const config = statusConfig[jobStatus];
    if (!config) return null; // Should not happen with defined types
    
    const Icon = config.icon;
    const shouldAnimate = 'animate' in config && config.animate; // Explicit check
    
    return (
      <Badge 
        variant="outline" 
        className={`flex items-center gap-1 bg-${config.color}-50 text-${config.color}-700 border-${config.color}-200`}
      >
        <Icon className={`h-3 w-3 ${shouldAnimate ? 'animate-spin' : ''}`} />
        <span>{config.text}</span>
      </Badge>
    );
  };

  // Format date string for display
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A'; // Handle null or undefined dates
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit', hour12: true 
      }).format(date);
    } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return 'Invalid date';
    }
  };

  // Get status icon component for history dropdown
  const getStatusIcon = (status: ResearchJob['status'] | null) => {
    if (!status) return null;
    
    const iconConfig = {
      completed: { icon: CheckCircle, color: "text-green-500" },
      failed: { icon: AlertCircle, color: "text-red-500" },
      processing: { icon: Loader2, color: "text-blue-500", animate: true },
      queued: { icon: Clock, color: "text-yellow-500" },
    };
    
    const config = iconConfig[status];
    if (!config) return null;
    
    const Icon = config.icon;
    const shouldAnimate = 'animate' in config && config.animate; // Explicit check
    return <Icon className={`h-4 w-4 ${config.color} ${shouldAnimate ? 'animate-spin' : ''} mr-2 flex-shrink-0`} />;
  };

  // --- Render JSX ---
  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      {/* Header Section */}
      <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-full">
        {/* Title and Status */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Background Job Research</h2>
            {renderStatusBadge()}
          </div>
          <p className="text-sm text-muted-foreground">
            Research continues in the background. You can close this window.
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {jobId ? (
            // Show "New Research" button if a job is loaded/active
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearDisplay}
              disabled={isLoading || isLoadingSaved || isLoadingJobs} // Disable while any loading is active
            >
              New Research
            </Button>
          ) : (
            // Show "Start Research" button if no job is active
            <Button 
              onClick={() => handleResearch()} 
              disabled={isLoading || (notifyByEmail && !notificationEmail.trim())} // Disable if loading or email required but not provided
              className="flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isLoading ? "Starting..." : "Start Research"}
            </Button>
          )}
          
          {/* History Dropdown */}
          {savedJobs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isLoadingJobs || isLoading || isLoadingSaved} // Disable while loading anything
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
                  const probability = extractProbability(job); // Extract probability for display
                  return (
                    <DropdownMenuItem
                      key={job.id}
                      onClick={() => loadSavedResearch(job.id)}
                      disabled={isLoadingSaved || isLoading} // Disable if loading saved or starting new
                      className="flex flex-col items-start p-2 cursor-pointer"
                    >
                      {/* Top row: Icon, Title, Status */}
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center overflow-hidden mr-2">
                          {getStatusIcon(job.status)}
                          <span className="font-medium truncate flex-1">
                            {job.focus_text ? job.focus_text.slice(0, 25) + (job.focus_text.length > 25 ? '...' : '') : 'General research'}
                          </span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`ml-auto text-xs px-1.5 py-0.5 flex-shrink-0 ${
                            job.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 
                            job.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                            job.status === 'processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      {/* Bottom row: Date, Probability */}
                      <div className="flex items-center justify-between w-full mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(job.created_at)}
                        </span>
                        {probability && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
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

      {/* Initial Configuration Section (only shown if no job is active) */}
      {!jobId && (
        <div className="border-t pt-4 space-y-4">
          {/* Focus Text Input */}
          <div className="flex items-center gap-2 w-full">
            <Input
              placeholder="Optional: Add a specific focus area for your research..."
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
          </div>
          
          {/* Iterations Setting */}
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="iterations-select">Iterations</Label>
            </div>
            <Select
              value={maxIterations}
              onValueChange={setMaxIterations}
              disabled={isLoading}
            >
              <SelectTrigger id="iterations-select" className="w-full">
                <SelectValue placeholder="Number of iterations" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map(num => (
                  <SelectItem key={num} value={String(num)}>
                    {num} iteration{num > 1 ? 's' : ''} {num === 3 ? '(default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              More iterations provide deeper research but take longer.
            </p>
          </div>
        
          {/* Email Notification Setting */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="notify-email" 
                checked={notifyByEmail} 
                onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
                disabled={isLoading}
              />
              <Label htmlFor="notify-email" className="cursor-pointer">
                Notify me by email when research is complete
              </Label>
            </div>
            
            {notifyByEmail && (
              <div className="flex items-center gap-2 pl-6"> {/* Indent email input */}
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  disabled={isLoading}
                  className="flex-1"
                />
              </div>
            )}
          </div>
          
          {/* Start Button (duplicate for layout, shown only when no job active) */}
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
      )}

      {/* Display Focus Text if set */}
      {focusText && jobId && (
        <div className="bg-accent/10 px-3 py-2 rounded-md text-sm border border-dashed">
          <span className="font-medium">Research focus:</span> {focusText}
        </div>
      )}

      {/* Display Error Message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 p-3 rounded border border-red-200 dark:border-red-800 w-full max-w-full">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Progress Display */}
      {jobId && (
        <ProgressDisplay 
          messages={progress} 
          jobId={jobId} 
          progress={progressPercent}
          status={jobStatus}
        />
      )}
      
      {/* Iterations Section */}
      {iterations.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full space-y-2">
          <h3 className="text-lg font-medium mb-2">Research Iterations</h3>
          <div className="space-y-2">
            {iterations.map((iterationData) => {
              // Determine if this iteration is the one currently streaming chunks
              const isActivelyStreamingChunks = streamingIterationNumber === iterationData.iteration;
              
              // Determine the content to display: streamed content if active, otherwise final analysis
              const displayContent = isActivelyStreamingChunks 
                ? streamedAnalysisContent 
                : iterationData.analysis || (jobStatus === 'processing' && iterationData.iteration === streamingIterationNumber ? "Analysis starting..." : "Analysis pending...");
                
              // Determine the streaming status prop for AnalysisDisplay
              const isStreamingForDisplay = isActivelyStreamingChunks && jobStatus === 'processing';
              
              return (
                <IterationCard
                  key={iterationData.iteration}
                  iteration={iterationData} // Pass the full iteration data from the main job state
                  isExpanded={expandedIterations.includes(iterationData.iteration)}
                  onToggleExpand={() => toggleIterationExpand(iterationData.iteration)}
                  // Pass the specific content and streaming status for this iteration
                  analysisContent={displayContent} 
                  isAnalysisStreaming={isStreamingForDisplay}
                  // General status indicators
                  isCurrentIteration={jobStatus === 'processing' && iterationData.iteration === streamingIterationNumber}
                  maxIterations={parseInt(maxIterations, 10)}
                />
              );
            })}
          </div>
        </div>
      )}
      
      {/* Insights Section */}
      {structuredInsights && structuredInsights.parsedData && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Research Insights</h3>
          <InsightsDisplay 
            streamingState={structuredInsights} // Pass the final structured insights
            onResearchArea={handleResearchArea} // Callback to start new focused research
            marketData={{ // Pass relevant market data for context
              bestBid,
              bestAsk,
              noBestAsk,
              noBestBid, // Pass this too if available
              outcomes
            }}
          />
        </div>
      )}
      
      {/* Search Results Section */}
      {results.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Sources Used</h3>
          <SitePreviewList results={results} />
        </div>
      )}
    </Card>
  );
}
