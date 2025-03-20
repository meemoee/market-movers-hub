
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
  const realtimeChannelRef = useRef<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    const loadJobData = async () => {
      if (jobId) {
        const { data: job } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('id', jobId)
          .single()

        if (job) {
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
                
                const goodBuyOpportunities = calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability);
                
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
        }
      }
    }

    loadJobData()
  }, [jobId])

  const calculateGoodBuyOpportunities = (probabilityStr: string) => {
    if (!probabilityStr || !outcomes || typeof probabilityStr !== 'string') {
      return null;
    }
    
    try {
      // Extract numeric value from probability string (e.g., "60%" -> 0.6)
      const probabilityMatch = probabilityStr.match(/(\d+)/);
      if (!probabilityMatch) return null;
      
      const predictedProbability = parseInt(probabilityMatch[0], 10) / 100;
      if (isNaN(predictedProbability)) return null;
      
      const opportunities = [];
      
      // Check YES opportunity
      if (bestAsk !== undefined && bestAsk > 0) {
        const yesDifference = ((predictedProbability - bestAsk) / bestAsk * 100).toFixed(1);
        
        if (predictedProbability > bestAsk) {
          opportunities.push({
            outcome: "YES",
            predictedProbability: predictedProbability,
            marketPrice: bestAsk,
            difference: `+${yesDifference}%`
          });
        }
      }
      
      // Check NO opportunity
      if (noBestAsk !== undefined && noBestAsk > 0) {
        const noPredictedProbability = 1 - predictedProbability;
        const noDifference = ((noPredictedProbability - noBestAsk) / noBestAsk * 100).toFixed(1);
        
        if (noPredictedProbability > noBestAsk) {
          opportunities.push({
            outcome: "NO",
            predictedProbability: noPredictedProbability,
            marketPrice: noBestAsk,
            difference: `+${noDifference}%`
          });
        }
      }
      
      return opportunities.length > 0 ? opportunities : null;
    } catch (e) {
      console.error('Error calculating buy opportunities:', e);
      return null;
    }
  };

  const toggleIterationExpand = (iteration: number) => {
    setExpandedIterations(prev => {
      if (prev.includes(iteration)) {
        return prev.filter(i => i !== iteration);
      } else {
        return [...prev, iteration];
      }
    });
  }

  const setupRealtimeSubscription = (newJobId: string) => {
    const channel = supabase
      .channel(`job-${newJobId}`)
      .on('broadcast', { event: 'job_update' }, (payload) => {
        console.log('Received job update:', payload);
        
        const { status, current_iteration, max_iterations, message, progress } = payload.payload;
        
        if (status) setJobStatus(status);
        
        if (message) {
          setProgress(prev => [...prev, message]);
        }
        
        if (progress !== undefined) {
          setProgressPercent(progress);
        }
        
        if (current_iteration !== undefined && max_iterations !== undefined) {
          setProgressPercent(Math.round((current_iteration / max_iterations) * 100));
        }
        
        if (status === 'completed' || status === 'failed') {
          setTimeout(() => {
            loadJobData(newJobId);
          }, 1000);
        }
      })
      .subscribe((status) => {
        console.log(`Realtime subscription status: ${status}`);
      });
    
    realtimeChannelRef.current = channel;
    
    return () => {
      channel.unsubscribe();
    };
  };

  const loadJobData = async (id: string) => {
    const { data: job, error } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error loading job data:', error);
      return;
    }
    
    if (job) {
      setJobStatus(job.status);
      setProgress(job.progress_log || []);
      setProgressPercent(job.current_iteration / job.max_iterations * 100);
      
      if (job.status === 'completed' && job.results) {
        try {
          let parsedResults;
          if (typeof job.results === 'string') {
            parsedResults = JSON.parse(job.results);
          } else {
            parsedResults = job.results;
          }
          
          if (parsedResults.data && Array.isArray(parsedResults.data)) {
            setResults(parsedResults.data);
          }
          
          if (parsedResults.analysis) {
            setAnalysis(parsedResults.analysis);
          }
          
          if (parsedResults.iterations && Array.isArray(parsedResults.iterations)) {
            setIterations(parsedResults.iterations);
          }
          
          if (parsedResults.structuredInsights) {
            const goodBuyOpportunities = calculateGoodBuyOpportunities(
              parsedResults.structuredInsights.probability
            );
            
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
          console.error('Error parsing job results:', e);
        }
      } else if (job.iterations && Array.isArray(job.iterations)) {
        setIterations(job.iterations);
      }
    }
  };

  const createResearchJob = async () => {
    setIsLoading(true);
    setError(null);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setAnalysis('');
    setJobId(null);
    setIterations([]);
    setExpandedIterations([]);
    setJobStatus(null);
    setStructuredInsights(null);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const jobData = {
        market_id: marketId,
        query: description,
        status: 'queued',
        max_iterations: parseInt(maxIterations, 10),
        current_iteration: 0,
        progress_log: ['Job queued for processing'],
        user_id: user.user?.id,
        focus_text: focusText || null,
        notification_email: notifyByEmail ? notificationEmail : null
      };
      
      const { data, error } = await supabase
        .from('research_jobs')
        .insert(jobData)
        .select()
        .single();
      
      if (error) throw error;
      
      if (data) {
        setJobId(data.id);
        setJobStatus('queued');
        toast({
          title: "Research job created",
          description: "Your research job has been queued and will start processing shortly."
        });
        
        // Set up realtime subscription for job updates
        const unsubscribe = setupRealtimeSubscription(data.id);
        
        // Schedule job processing via edge function
        const processingResponse = await supabase.functions.invoke('create-research-job', {
          body: { jobId: data.id }
        });
        
        if (processingResponse.error) {
          console.error('Error starting job processing:', processingResponse.error);
          toast({
            variant: "destructive",
            title: "Error starting job",
            description: "There was an error starting the job processing."
          });
        }
        
        return () => {
          if (unsubscribe) unsubscribe();
        };
      }
    } catch (e) {
      console.error('Error creating research job:', e);
      setError(`Error creating research job: ${e instanceof Error ? e.message : 'Unknown error'}`);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to create research job: ${e instanceof Error ? e.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSavedJobs = async () => {
    setIsLoadingJobs(true);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      
      if (!user.user) {
        console.log('User not authenticated, skipping saved jobs loading');
        return;
      }
      
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        setSavedJobs(data);
      }
    } catch (e) {
      console.error('Error loading saved jobs:', e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  // Load saved jobs on component mount
  useEffect(() => {
    loadSavedJobs();
  }, [marketId]);

  // Cleanup realtime subscription on unmount
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
      }
    };
  }, []);

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">AI Research Assistant</h3>
        
        <div className="flex space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                Saved Research
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {isLoadingJobs ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Loading...</span>
                </div>
              ) : savedJobs.length > 0 ? (
                savedJobs.map(job => (
                  <DropdownMenuItem 
                    key={job.id} 
                    onClick={() => {
                      setJobId(job.id);
                      loadJobData(job.id);
                    }}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        {job.status === 'completed' && <CheckCircle className="h-3 w-3 text-green-500" />}
                        {job.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                        {job.status === 'queued' && <Clock className="h-3 w-3 text-orange-500" />}
                        {job.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-500" />}
                        <span className="font-medium">
                          {job.focus_text || `Research ${job.id.substring(0, 8)}`}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.created_at).toLocaleDateString()} • 
                        {job.status === 'completed' 
                          ? ` Completed` 
                          : job.status === 'processing' 
                            ? ` Processing` 
                            : job.status === 'queued' 
                              ? ` Queued` 
                              : ` Failed`}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  No saved research found
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="p-4 space-y-4 min-w-[250px]">
                <div className="space-y-2">
                  <Label htmlFor="iterations">Max Iterations</Label>
                  <Select
                    value={maxIterations}
                    onValueChange={setMaxIterations}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="iterations">
                      <SelectValue placeholder="Select iterations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 iteration (Quick)</SelectItem>
                      <SelectItem value="2">2 iterations (Basic)</SelectItem>
                      <SelectItem value="3">3 iterations (Standard)</SelectItem>
                      <SelectItem value="4">4 iterations (Thorough)</SelectItem>
                      <SelectItem value="5">5 iterations (Comprehensive)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="notify" 
                      checked={notifyByEmail}
                      onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
                      disabled={isLoading}
                    />
                    <Label htmlFor="notify" className="cursor-pointer">Notify by email when complete</Label>
                  </div>
                  
                  {notifyByEmail && (
                    <Input
                      type="email"
                      placeholder="Your email address"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      disabled={isLoading}
                    />
                  )}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        <div className="flex-1">
          <Input
            placeholder="Research focus (optional)"
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <Button
          onClick={createResearchJob}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Start Research'
          )}
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      
      {jobStatus && (
        <div className="border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {jobStatus === 'queued' && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                  <Clock className="h-3 w-3 mr-1" /> Queued
                </Badge>
              )}
              {jobStatus === 'processing' && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing
                </Badge>
              )}
              {jobStatus === 'completed' && (
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  <CheckCircle className="h-3 w-3 mr-1" /> Completed
                </Badge>
              )}
              {jobStatus === 'failed' && (
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  <AlertCircle className="h-3 w-3 mr-1" /> Failed
                </Badge>
              )}
              
              {notifyByEmail && notificationEmail && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 mr-1" />
                  Will notify: {notificationEmail}
                </div>
              )}
            </div>
            
            {jobId && (
              <div className="text-xs text-muted-foreground">
                Job ID: {jobId}
              </div>
            )}
          </div>
          
          {(jobStatus === 'processing' || jobStatus === 'queued') && (
            <div className="w-full bg-accent/30 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-in-out"
                style={{ width: `${progressPercent}%` }}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Progress</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {progress.length > 0 && (
        <ProgressDisplay messages={progress} />
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
                isStreaming={streamingIterations.has(iteration.iteration)}
                isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                isFinalIteration={iteration.iteration === parseInt(maxIterations, 10)}
              />
            ))}
          </div>
        </div>
      )}
      
      {analysis && (
        <div className="border-t pt-4 w-full max-w-full">
          <AnalysisDisplay content={analysis} />
        </div>
      )}
      
      {structuredInsights && (
        <div className="border-t pt-4 w-full max-w-full">
          <InsightsDisplay streamingState={structuredInsights} />
        </div>
      )}
      
      {results.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full">
          <SitePreviewList results={results} />
        </div>
      )}
    </Card>
  );
}
