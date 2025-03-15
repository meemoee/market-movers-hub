
import { useState, useEffect } from 'react'
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
import { Loader2, CheckCircle, AlertCircle, Clock, History } from "lucide-react"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

// Define an interface for our research job data
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
  meta?: {
    marketQuestion?: string;
    bestBidPrice?: number | null;
    bestAskPrice?: number | null;
  };
}

export function JobQueueResearchCard({ description, marketId }: JobQueueResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [progressPercent, setProgressPercent] = useState<number>(0)
  const [results, setResults] = useState<ResearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [iterations, setIterations] = useState<any[]>([])
  const [expandedIterations, setExpandedIterations] = useState<number[]>([])
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [structuredInsights, setStructuredInsights] = useState<any>(null)
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [bestBidPrice, setBestBidPrice] = useState<number | undefined>(undefined)
  const [bestAskPrice, setBestAskPrice] = useState<number | undefined>(undefined)
  const [isLoadingOrderbook, setIsLoadingOrderbook] = useState(false)
  const { toast } = useToast()

  // Reset all state variables to their initial values
  const resetState = () => {
    setJobId(null);
    setPolling(false);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setError(null);
    setAnalysis('');
    setIterations([]);
    setExpandedIterations([]);
    setJobStatus(null);
    setStructuredInsights(null);
    setBestBidPrice(undefined);
    setBestAskPrice(undefined);
  }

  // Load saved research jobs for this market on component mount
  useEffect(() => {
    fetchSavedJobs();
    fetchOrderbookData();
  }, [marketId]);

  // Fetch orderbook data for the market to get best bid/ask prices
  const fetchOrderbookData = async () => {
    try {
      setIsLoadingOrderbook(true);
      
      // First, try to get the CLOB token ID for this market from the markets table
      const { data: marketData } = await supabase
        .from('markets')
        .select('clobtokenids')
        .eq('id', marketId)
        .maybeSingle();
      
      const clobTokenId = marketData?.clobtokenids?.[0] || marketId;
      
      console.log('Using CLOB token ID for orderbook:', clobTokenId);
      
      const response = await supabase.functions.invoke('get-orderbook', {
        body: JSON.stringify({ tokenId: clobTokenId })
      });

      if (response.error) {
        console.error('Error invoking get-orderbook function:', response.error);
        return;
      }

      if (response.data) {
        const orderbook = response.data;
        console.log('Fetched orderbook data:', orderbook);
        
        if (orderbook.best_bid !== null && orderbook.best_bid !== undefined) {
          setBestBidPrice(parseFloat(orderbook.best_bid));
        }
        
        if (orderbook.best_ask !== null && orderbook.best_ask !== undefined) {
          setBestAskPrice(parseFloat(orderbook.best_ask));
        }
      }
    } catch (error) {
      console.error('Error fetching orderbook data:', error);
    } finally {
      setIsLoadingOrderbook(false);
    }
  };

  // Fetch saved research jobs for this market
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

  // Helper function to load job data consistently
  const loadJobData = (job: ResearchJob) => {
    // Update state with the job details
    setJobId(job.id);
    setJobStatus(job.status);
    
    // Set progress percent based on current iteration
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(percent);
      
      // If the job is completed, set to 100%
      if (job.status === 'completed') {
        setProgressPercent(100);
      }
    }
    
    // Set progress log
    if (job.progress_log && Array.isArray(job.progress_log)) {
      setProgress(job.progress_log);
    }
    
    // Start polling if the job is still active
    if (job.status === 'queued' || job.status === 'processing') {
      setPolling(true);
    }
    
    // Set iterations data
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations);
      
      // Auto-expand the latest iteration
      if (job.iterations.length > 0) {
        setExpandedIterations([job.iterations.length]);
      }
    }
    
    // Set results if available
    if (job.status === 'completed' && job.results) {
      try {
        const parsedResults = JSON.parse(job.results);
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          setResults(parsedResults.data);
        }
        if (parsedResults.analysis) {
          setAnalysis(parsedResults.analysis);
        }
        if (parsedResults.structuredInsights) {
          // Get bid/ask prices from job metadata if available
          const storedBidPrice = job.meta?.bestBidPrice !== undefined ? job.meta.bestBidPrice : bestBidPrice;
          const storedAskPrice = job.meta?.bestAskPrice !== undefined ? job.meta.bestAskPrice : bestAskPrice;
          
          // Create the insights object with prices
          const insightsWithPrices = {
            parsedData: {
              ...parsedResults.structuredInsights,
              bestBidPrice: parsedResults.bestBidPrice || storedBidPrice,
              bestAskPrice: parsedResults.bestAskPrice || storedAskPrice
            },
            rawText: JSON.stringify(parsedResults.structuredInsights)
          };
          
          setStructuredInsights(insightsWithPrices);
          console.log('Setting structured insights with prices:', insightsWithPrices);
        }
      } catch (e) {
        console.error('Error parsing job results:', e);
      }
    }
    
    // Set error if job failed
    if (job.status === 'failed') {
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
    }

    // Set focus text if available
    if (job.focus_text) {
      setFocusText(job.focus_text);
    }
    
    // Set stored bid/ask prices if available in job metadata
    if (job.meta) {
      if (job.meta.bestBidPrice !== undefined && job.meta.bestBidPrice !== null) {
        setBestBidPrice(job.meta.bestBidPrice);
      }
      if (job.meta.bestAskPrice !== undefined && job.meta.bestAskPrice !== null) {
        setBestAskPrice(job.meta.bestAskPrice);
      }
    }
  }

  // Poll for job status
  useEffect(() => {
    if (!jobId || !polling) return;
    
    const pollInterval = setInterval(async () => {
      try {
        console.log(`Polling for job status: ${jobId}`);
        const { data, error } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
          
        if (error) {
          console.error('Error polling job status:', error);
          return;
        }
        
        if (!data) {
          console.log('No job data found');
          return;
        }
        
        const job = data as ResearchJob;
        console.log('Job status:', job.status);
        
        // Update job status
        setJobStatus(job.status);
        
        // Update progress based on status
        if (job.status === 'completed') {
          setPolling(false);
          setProgressPercent(100);
          setProgress(prev => [...prev, 'Job completed successfully!']);
          
          if (job.results) {
            try {
              const parsedResults = JSON.parse(job.results);
              if (parsedResults.data && Array.isArray(parsedResults.data)) {
                setResults(parsedResults.data);
              }
              if (parsedResults.analysis) {
                setAnalysis(parsedResults.analysis);
              }
              if (parsedResults.structuredInsights) {
                // Get bid/ask prices from job metadata or results
                const storedBidPrice = job.meta?.bestBidPrice !== undefined ? job.meta.bestBidPrice : bestBidPrice;
                const storedAskPrice = job.meta?.bestAskPrice !== undefined ? job.meta.bestAskPrice : bestAskPrice;
                
                // Include market prices in structuredInsights
                const insightsWithPrices = {
                  parsedData: {
                    ...parsedResults.structuredInsights,
                    bestBidPrice: parsedResults.bestBidPrice || storedBidPrice,
                    bestAskPrice: parsedResults.bestAskPrice || storedAskPrice
                  },
                  rawText: JSON.stringify(parsedResults.structuredInsights)
                };
                setStructuredInsights(insightsWithPrices);
                console.log('Setting structured insights with prices on completion:', insightsWithPrices);
              }
            } catch (e) {
              console.error('Error parsing job results:', e);
            }
          }
          
          // Refresh the list of saved jobs after completion
          fetchSavedJobs();
          
          clearInterval(pollInterval);
        } else if (job.status === 'failed') {
          setPolling(false);
          setError(`Job failed: ${job.error_message || 'Unknown error'}`);
          setProgress(prev => [...prev, `Job failed: ${job.error_message || 'Unknown error'}`]);
          
          // Refresh the list of saved jobs even if failed
          fetchSavedJobs();
          
          clearInterval(pollInterval);
        } else if (job.status === 'processing') {
          // Calculate progress based on current_iteration and max_iterations
          if (job.max_iterations && job.current_iteration !== undefined) {
            const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
            setProgressPercent(percent);
          }
          
          // Add progress log entries if they exist
          if (job.progress_log && Array.isArray(job.progress_log)) {
            // Only add new progress items
            const newItems = job.progress_log.slice(progress.length);
            if (newItems.length > 0) {
              setProgress(prev => [...prev, ...newItems]);
            }
          }
          
          // Update iterations data
          if (job.iterations && Array.isArray(job.iterations)) {
            setIterations(job.iterations);
            
            // If this is the first time we're seeing a new iteration, expand it
            if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
              setExpandedIterations(prev => [...prev, job.current_iteration]);
            }
          }
        }
      } catch (e) {
        console.error('Error in poll interval:', e);
      }
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [jobId, polling, progress.length, expandedIterations]);

  const handleResearch = async (initialFocusText = '') => {
    // Reset state before starting a new research
    resetState();
    setIsLoading(true);

    const useFocusText = initialFocusText || focusText;

    try {
      setProgress(prev => [...prev, "Starting research job..."]);
      
      // Ensure we have the latest orderbook data if not already loaded
      if (bestBidPrice === undefined || bestAskPrice === undefined) {
        setProgress(prev => [...prev, "Fetching market price data..."]);
        await fetchOrderbookData();
      }
      
      const payload = {
        marketId,
        query: description,
        maxIterations: 3,
        focusText: useFocusText.trim() || undefined,
        bestBidPrice,
        bestAskPrice
      };
      
      console.log('Creating research job with payload:', payload);
      
      // Call the job creation endpoint
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
      
      // Store the job ID
      const jobId = response.data.jobId;
      setJobId(jobId);
      setPolling(true);
      setJobStatus('queued');
      setProgress(prev => [...prev, `Research job created with ID: ${jobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      
      toast({
        title: "Background Research Started",
        description: `Job ID: ${jobId}. You can close this window and check back later.`,
      });
      
      // Refresh the list of saved jobs after starting a new one
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

  // Load a saved research job
  const loadSavedResearch = async (jobId: string) => {
    try {
      setIsLoadingSaved(true);
      
      // Reset state before loading a new research
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
      
      // Load job data
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
    // Reset focus text input before starting new research with the selected area
    setFocusText('');
    
    // Start a new research job with the selected area as the focus text
    toast({
      title: "Starting Focused Research",
      description: `Creating new research job focused on: ${area}`,
    });
    
    // Start research with the selected area
    handleResearch(area);
  };

  // Clear the current job display and return to the blank state
  const handleClearDisplay = () => {
    resetState();
    setFocusText('');
  };

  // Function to render status badge
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

  // Get a status icon for history items
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
              disabled={isLoading || polling || isLoadingOrderbook}
              className="flex items-center gap-2"
            >
              {(isLoading || isLoadingOrderbook) && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Starting..." : isLoadingOrderbook ? "Loading market data..." : "Start Research"}
            </Button>
          )}
          
          {savedJobs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isLoadingJobs || isLoading || isLoadingSaved}
                >
                  {isLoadingJobs ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> 
                  ) : (
                    <History className="h-4 w-4 mr-2" />
                  )}
                  History
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px]">
                {savedJobs.map((job) => (
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
                    <span className="text-xs text-muted-foreground mt-1">
                      {formatDate(job.created_at)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {!jobId && (
        <div className="flex items-center gap-2 w-full">
          <Input
            placeholder="Add an optional focus area for your research..."
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            disabled={isLoading || polling}
            className="flex-1"
          />
        </div>
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
                isStreaming={polling && iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                maxIterations={3}
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
            bestBidPrice={bestBidPrice}
            bestAskPrice={bestAskPrice}
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
