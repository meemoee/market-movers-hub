
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
  const [polling, setPolling] = useState(false)
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
  const { toast } = useToast()
  const [streamingAnalysis, setStreamingAnalysis] = useState<string>("")
  const [streamingActive, setStreamingActive] = useState<boolean>(false)
  const [streamAbortController, setStreamAbortController] = useState<AbortController | null>(null)

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
    setFocusText('');
    setStreamingAnalysis("");
    setStreamingActive(false);
    
    if (streamAbortController) {
      streamAbortController.abort();
      setStreamAbortController(null);
    }
  }

  useEffect(() => {
    fetchSavedJobs();
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

  const setupStreamingConnection = (jobId: string, iteration: any) => {
    try {
      // Abort previous connection if it exists
      if (streamAbortController) {
        streamAbortController.abort();
      }
      
      // Create a new abort controller for this connection
      const controller = new AbortController();
      setStreamAbortController(controller);
      
      // Get the content to analyze
      const content = iteration?.results?.map((r: any) => r.content || "").join("\n\n");
      
      if (!content) {
        console.error("No content available for streaming analysis");
        return;
      }
      
      // Reset streaming state
      setStreamingAnalysis("");
      setStreamingActive(true);
      
      // Connect to streaming endpoint
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          jobId,
          content,
          query: description,
          question: description,
          focusText: focusText,
          previousAnalyses: iterations.map(i => i.analysis || "").join("\n\n"),
          areasForResearch: iterations.flatMap(i => i.areas_for_research || []),
        }),
        signal: controller.signal
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Stream connection error: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body reader is null");
        }
        
        // Start processing the stream
        const processStream = async () => {
          try {
            let buffer = "";
            
            // Function to process SSE messages
            const processSSEMessage = (message: string) => {
              if (!message.trim()) return;
              
              try {
                const data = JSON.parse(message);
                
                if (data.error) {
                  console.error("Stream error:", data.error);
                  setProgress(prev => [...prev, `Streaming error: ${data.error}`]);
                  return;
                }
                
                if (data.done) {
                  console.log("Stream completed");
                  setStreamingActive(false);
                  return;
                }
                
                if (data.chunk) {
                  setStreamingAnalysis(prev => prev + data.chunk);
                }
              } catch (e) {
                console.error("Error parsing SSE message:", e, message);
              }
            };
            
            // Read stream chunks
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                setStreamingActive(false);
                if (buffer.trim()) {
                  processSSEMessage(buffer);
                }
                break;
              }
              
              // Decode and process the chunk
              const chunk = new TextDecoder().decode(value);
              buffer += chunk;
              
              // Process complete SSE messages (data: {...}\n\n)
              const messages = buffer.split("\n\n");
              
              // Process all complete messages
              for (let i = 0; i < messages.length - 1; i++) {
                const message = messages[i].replace(/^data: /, "");
                processSSEMessage(message);
              }
              
              // Keep the last incomplete message in the buffer
              buffer = messages[messages.length - 1];
            }
          } catch (error) {
            if (error.name !== 'AbortError') {
              console.error("Stream processing error:", error);
              setProgress(prev => [...prev, `Stream error: ${error.message}`]);
            }
            setStreamingActive(false);
          }
        };
        
        processStream();
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          console.error("Stream fetch error:", error);
          setProgress(prev => [...prev, `Stream connection error: ${error.message}`]);
        }
        setStreamingActive(false);
      });
    } catch (error) {
      console.error("Setup streaming error:", error);
      setStreamingActive(false);
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
    
    if (job.status === 'queued' || job.status === 'processing') {
      setPolling(true);
      
      // If the job is on its last iteration, set up streaming
      if (job.iterations && Array.isArray(job.iterations) && 
          job.iterations.length > 0 && 
          job.current_iteration === job.max_iterations) {
        const lastIteration = job.iterations[job.iterations.length - 1];
        setupStreamingConnection(job.id, lastIteration);
      }
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations);
      
      if (job.iterations.length > 0) {
        setExpandedIterations([job.iterations.length]);
      }
    }
    
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
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
          setStructuredInsights({
            parsedData: {
              ...parsedResults.structuredInsights,
              goodBuyOpportunities
            },
            rawText: JSON.stringify(parsedResults.structuredInsights)
          });
        }
      } catch (e) {
        console.error('Error parsing job results:', e);
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
      const parsedResults = JSON.parse(job.results);
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
        
        setJobStatus(job.status);
        
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
                const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
                  calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
                  null;
                
                setStructuredInsights({
                  parsedData: {
                    ...parsedResults.structuredInsights,
                    goodBuyOpportunities
                  },
                  rawText: JSON.stringify(parsedResults.structuredInsights)
                });
              }
            } catch (e) {
              console.error('Error parsing job results:', e);
            }
          }
          
          fetchSavedJobs();
          
          clearInterval(pollInterval);
        } else if (job.status === 'failed') {
          setPolling(false);
          setError(`Job failed: ${job.error_message || 'Unknown error'}`);
          setProgress(prev => [...prev, `Job failed: ${job.error_message || 'Unknown error'}`]);
          
          fetchSavedJobs();
          
          clearInterval(pollInterval);
        } else if (job.status === 'processing') {
          if (job.max_iterations && job.current_iteration !== undefined) {
            const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
            setProgressPercent(percent);
          }
          
          if (job.progress_log && Array.isArray(job.progress_log)) {
            const newItems = job.progress_log.slice(progress.length);
            if (newItems.length > 0) {
              setProgress(prev => [...prev, ...newItems]);
            }
          }
          
          if (job.iterations && Array.isArray(job.iterations)) {
            setIterations(job.iterations);
            
            if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
              setExpandedIterations(prev => [...prev, job.current_iteration]);
            }
          }

          if (job.max_iterations && job.current_iteration === job.max_iterations &&
              job.iterations && Array.isArray(job.iterations) && job.iterations.length > 0) {
            // Last iteration - set up streaming if not already active
            if (!streamingActive) {
              const currentIteration = job.iterations[job.iterations.length - 1];
              setupStreamingConnection(jobId, currentIteration);
            }
          }
        }
      } catch (e) {
        console.error('Error in poll interval:', e);
      }
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [jobId, polling, progress.length, expandedIterations, bestBid, bestAsk, noBestBid, outcomes, streamingActive]);

  useEffect(() => {
    // Clean up streaming connection on component unmount
    return () => {
      if (streamAbortController) {
        streamAbortController.abort();
      }
    };
  }, []);

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
      setJobId(jobId);
      setPolling(true);
      setJobStatus('queued');
      setProgress(prev => [...prev, `Research job created with ID: ${jobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      setProgress(prev => [...prev, `Set to run ${numIterations} research iterations`]);
      
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
              disabled={isLoading || polling || (notifyByEmail && !notificationEmail.trim())}
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
                disabled={isLoading || polling}
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
                disabled={isLoading || polling}
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
                disabled={isLoading || polling || (notifyByEmail && !notificationEmail.trim())}
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
                isStreaming={polling && iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                maxIterations={parseInt(maxIterations, 10)}
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
              outcomes
            }}
          />
        </div>
      )}
      
      {results.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Source Documents</h3>
          <SitePreviewList results={results} />
        </div>
      )}
    </Card>
  );
}
