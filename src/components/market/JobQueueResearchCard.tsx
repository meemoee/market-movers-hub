
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
              
              // Log the iteration analyses to verify we're getting them
              if (parsedResults.iterationAnalyses && Array.isArray(parsedResults.iterationAnalyses)) {
                console.log(`Received ${parsedResults.iterationAnalyses.length} iteration analyses in results`);
              } else {
                console.log('No iteration analyses in results');
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
        }
        
        // Update iterations data
        if (job.iterations && Array.isArray(job.iterations)) {
          // Process iterations to add any missing properties
          const processedIterations = job.iterations.map(iteration => ({
            ...iteration,
            results: iteration.results || [],
            queries: iteration.queries || [],
            analysis: iteration.analysis || ""
          }));
          
          // Log all iterations to verify analysis field
          processedIterations.forEach(iter => {
            console.log(`Iteration ${iter.iteration} analysis length: ${iter.analysis ? iter.analysis.length : 0}`);
          });
          
          setIterations(processedIterations);
          
          // Auto expand the current iteration
          if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
            setExpandedIterations(prev => 
              [...prev.filter(i => i !== job.current_iteration - 1), job.current_iteration]
            );
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
      setProgress(prev => [...prev, `Research job created with ID: ${jobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      
      toast({
        title: "Background Research Started",
        description: `Job ID: ${jobId}. You can close this window and check back later.`,
      });
      
    } catch (error) {
      console.error('Error in research job:', error);
      setError(`Error occurred during research job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIterationExpand = (iterationNumber: number) => {
    setExpandedIterations(prev => 
      prev.includes(iterationNumber)
        ? prev.filter(i => i !== iterationNumber)
        : [...prev, iterationNumber]
    );
  };

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between w-full max-w-full">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Background Job Research</h2>
          <p className="text-sm text-muted-foreground">
            This research continues in the background even if you close your browser.
          </p>
        </div>
        
        <Button 
          onClick={handleResearch} 
          disabled={isLoading || polling}
        >
          {isLoading ? "Starting..." : jobId ? "Job Running..." : "Start Research"}
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
      />
      
      {iterations.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Research Iterations</h3>
          <div className="space-y-2">
            {iterations.map((iteration) => (
              <IterationCard
                key={iteration.iteration}
                iteration={iteration}
                isExpanded={expandedIterations.includes(iteration.iteration)}
                onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
                isStreaming={polling && iteration.iteration === iterations[iterations.length - 1]?.iteration}
                isCurrentIteration={iteration.iteration === iterations[iterations.length - 1]?.iteration}
                maxIterations={iterations[iterations.length - 1]?.iteration || 3}
              />
            ))}
          </div>
        </div>
      )}
      
      {results.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">All Search Results</h3>
          <SitePreviewList results={results} />
        </div>
      )}
      
      {analysis && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Final Analysis</h3>
          <AnalysisDisplay content={analysis} />
        </div>
      )}
    </Card>
  );
}
