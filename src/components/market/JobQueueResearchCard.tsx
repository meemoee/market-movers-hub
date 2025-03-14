
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
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react"

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
  const { toast } = useToast()

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
            } catch (e) {
              console.error('Error parsing job results:', e);
            }
          }
          
          clearInterval(pollInterval);
        } else if (job.status === 'failed') {
          setPolling(false);
          setError(`Job failed: ${job.error_message || 'Unknown error'}`);
          setProgress(prev => [...prev, `Job failed: ${job.error_message || 'Unknown error'}`]);
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

  const handleResearch = async () => {
    setIsLoading(true);
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

    try {
      setProgress(prev => [...prev, "Starting research job..."]);
      
      const payload = {
        marketId,
        query: description,
        maxIterations: 3
      };
      
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
        
        <Button 
          onClick={handleResearch} 
          disabled={isLoading || polling}
          className="flex items-center gap-2"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Starting..." : jobId && jobStatus !== 'completed' && jobStatus !== 'failed' ? "Job Running..." : "Start Research"}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-2 rounded w-full max-w-full">
          {error}
        </div>
      )}

      <ProgressDisplay 
        messages={progress} 
        jobId={jobId || undefined} 
        progress={progressPercent}
        status={jobStatus}
      />
      
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
