
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

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
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
        
        console.log('Job status:', data.status);
        
        // Update progress based on status
        if (data.status === 'completed') {
          setPolling(false);
          setProgressPercent(100);
          setProgress(prev => [...prev, 'Job completed successfully!']);
          
          if (data.results) {
            try {
              const parsedResults = JSON.parse(data.results);
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
        } else if (data.status === 'failed') {
          setPolling(false);
          setError(`Job failed: ${data.error_message || 'Unknown error'}`);
          setProgress(prev => [...prev, `Job failed: ${data.error_message || 'Unknown error'}`]);
          clearInterval(pollInterval);
        } else if (data.status === 'processing') {
          // Calculate progress based on current_iteration and max_iterations
          if (data.max_iterations && data.current_iteration !== undefined) {
            const percent = Math.round((data.current_iteration / data.max_iterations) * 100);
            setProgressPercent(percent);
          }
          
          // Add progress log entries if they exist
          if (data.progress_log && Array.isArray(data.progress_log)) {
            // Only add new progress items
            const newItems = data.progress_log.slice(progress.length);
            if (newItems.length > 0) {
              setProgress(prev => [...prev, ...newItems]);
            }
          }
        }
      } catch (e) {
        console.error('Error in poll interval:', e);
      }
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [jobId, polling, progress.length]);

  const handleResearch = async () => {
    setIsLoading(true);
    setJobId(null);
    setPolling(false);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setError(null);
    setAnalysis('');

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
      
      {results.length > 0 && (
        <>
          <div className="border-t pt-4 w-full max-w-full">
            <h3 className="text-lg font-medium mb-2">Search Results</h3>
            <SitePreviewList results={results} />
          </div>
          
          {analysis && (
            <div className="border-t pt-4 w-full max-w-full">
              <h3 className="text-lg font-medium mb-2">Analysis</h3>
              <AnalysisDisplay content={analysis} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
