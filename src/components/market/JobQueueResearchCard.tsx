import { useState, useEffect, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ProgressDisplay } from "./research/ProgressDisplay";
import { AnalysisDisplay } from "./research/AnalysisDisplay";
import { InsightsDisplay } from "./research/InsightsDisplay";
import { IterationCard } from "./research/IterationCard";
import { Badge } from "@/components/ui/badge";
import { ResearchHeader } from "./research/ResearchHeader";
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

interface ResearchJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  results?: any;
  progress_log?: string[];
  current_iteration?: number;
  max_iterations?: number;
  iterations?: any[];
  focus_text?: string;
}

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
  bestBid?: number;
  bestAsk?: number;
  noBestBid?: number;
  noBestAsk?: number;
  outcomes?: string[];
}

export function JobQueueResearchCard({ 
  description, 
  marketId,
  bestBid,
  bestAsk,
  noBestBid,
  noBestAsk,
  outcomes
}: JobQueueResearchCardProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [iterations, setIterations] = useState<any[]>([]);
  const [expandedIterations, setExpandedIterations] = useState<number[]>([]);
  const [structuredInsights, setStructuredInsights] = useState<any>(null);
  const [focusText, setFocusText] = useState<string>('');

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
      subscribeToJobUpdates(job.id);
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations);
      
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
            ...parsedResults.structuredInsights,
            goodBuyOpportunities
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
    if (!probabilityStr || !outcomes || outcomes.length === 0 || !bestBid || !bestAsk) {
      return null;
    }
    
    try {
      const numericMatch = probabilityStr.match(/(\d+)/);
      if (!numericMatch) return null;
      
      const predictedProbability = parseInt(numericMatch[0], 10) / 100;
      
      const MIN_DIFF_THRESHOLD = 0.05;
      const opportunities = [];
      
      if (Math.abs(predictedProbability - bestAsk) > MIN_DIFF_THRESHOLD && 
          predictedProbability > bestAsk) {
        opportunities.push({
          outcome: "Yes",
          predictedProbability,
          marketPrice: bestAsk,
          difference: `+${Math.round((predictedProbability - bestAsk) * 100)}%`
        });
      }
      
      const noPredictedProbability = 1 - predictedProbability;
      const noMarketPrice = noBestAsk || (1 - bestBid);
      
      if (Math.abs(noPredictedProbability - noMarketPrice) > MIN_DIFF_THRESHOLD && 
          noPredictedProbability > noMarketPrice) {
        opportunities.push({
          outcome: "No",
          predictedProbability: noPredictedProbability,
          marketPrice: noMarketPrice,
          difference: `+${Math.round((noPredictedProbability - noMarketPrice) * 100)}%`
        });
      }
      
      return opportunities.length > 0 ? opportunities : null;
    } catch (e) {
      console.error("Error calculating buy opportunities:", e);
      return null;
    }
  };

  const subscribeToJobUpdates = useCallback((id: string) => {
    const channel = supabase
      .channel(`job-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'research_jobs',
        filter: `id=eq.${id}`
      }, (payload) => {
        console.log('Received job update:', payload.new);
        loadJobData(payload.new as ResearchJob);
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleResearch = async () => {
    setIsLoading(true);
    setJobId(null);
    setJobStatus(null);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setError(null);
    setAnalysis('');
    setStructuredInsights(null);
    setIterations([]);
    setExpandedIterations([]);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-research-job', {
        body: JSON.stringify({
          description,
          marketId,
          marketQuestion: description,
          marketDescription: description,
          bestBid,
          bestAsk,
          noBestBid,
          noBestAsk,
          outcomes
        })
      });
      
      if (error) {
        console.error("Error creating research job:", error);
        setError(`Error creating job: ${error.message}`);
        setIsLoading(false);
        return;
      }
      
      console.log("Created research job:", data);
      
      if (data?.jobId) {
        setJobId(data.jobId);
        setJobStatus('queued');
        setProgress(['Research job created. Waiting in queue...']);
        
        const interval = setInterval(async () => {
          const { data: jobData, error: jobError } = await supabase
            .from('research_jobs')
            .select('*')
            .eq('id', data.jobId)
            .single();
          
          if (jobError) {
            console.error("Error fetching job:", jobError);
            clearInterval(interval);
            return;
          }
          
          if (jobData) {
            loadJobData(jobData as ResearchJob);
            
            if (jobData.status === 'completed' || jobData.status === 'failed') {
              clearInterval(interval);
              setIsLoading(false);
            }
          }
        }, 2000);
        
        return () => clearInterval(interval);
      } else {
        setError('No job ID returned from API');
        setIsLoading(false);
      }
    } catch (e) {
      console.error("Error creating research job:", e);
      setError(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkExistingJob = async () => {
      if (!marketId) return;
      
      try {
        const { data, error } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('market_id', marketId)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (error) {
          console.error("Error fetching existing job:", error);
          return;
        }
        
        if (data && data.length > 0) {
          console.log("Found existing research job:", data[0]);
          loadJobData(data[0] as ResearchJob);
          
          if (data[0].status === 'queued' || data[0].status === 'processing') {
            setIsLoading(true);
          }
        }
      } catch (e) {
        console.error("Error checking for existing job:", e);
      }
    };
    
    checkExistingJob();
  }, [marketId]);

  const renderContent = () => {
    if (error) {
      return (
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      );
    }
    
    if (isLoading || jobStatus === 'queued' || jobStatus === 'processing') {
      return (
        <div className="space-y-4">
          {progressPercent > 0 && (
            <div className="w-full bg-accent/30 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-in-out"
                style={{ width: `${progressPercent}%` }}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Progress</span>
                <span>{progressPercent}% complete</span>
              </div>
            </div>
          )}
          
          <ProgressDisplay messages={progress} />
          
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="space-y-6">
        {iterations.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Research Process</h3>
            <div className="space-y-2">
              {iterations.map((iteration, index) => (
                <IterationCard
                  key={`iteration-${index + 1}`}
                  iteration={{
                    iteration: index + 1,
                    queries: iteration.queries || [],
                    results: iteration.results || [],
                    analysis: iteration.analysis || '',
                  }}
                  isExpanded={expandedIterations.includes(index + 1)}
                  onToggleExpand={() => {
                    setExpandedIterations(prev => {
                      if (prev.includes(index + 1)) {
                        return prev.filter(i => i !== (index + 1));
                      } else {
                        return [...prev, index + 1];
                      }
                    });
                  }}
                  isStreaming={false}
                  isCurrentIteration={false}
                  maxIterations={iterations.length}
                />
              ))}
            </div>
          </div>
        )}
        
        {analysis && (
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Analysis</h3>
            <AnalysisDisplay content={analysis} />
          </div>
        )}
        
        {structuredInsights && (
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Insights</h3>
            <InsightsDisplay 
              insights={structuredInsights}
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
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Results</h3>
            <div className="space-y-2">
              {results.map((result, index) => (
                <Card key={index} className="p-4 text-sm">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <ResearchHeader
          title="Job Queue AI Research"
          subtitle="Research with GPU-powered, enhanced reasoning"
          badgeText={jobStatus ? jobStatus.toUpperCase() : undefined}
          badgeVariant={
            jobStatus === 'completed' ? 'success' :
            jobStatus === 'failed' ? 'destructive' :
            jobStatus === 'processing' ? 'default' :
            jobStatus === 'queued' ? 'outline' : undefined
          }
        />
        
        <Button 
          onClick={handleResearch} 
          disabled={isLoading || jobStatus === 'queued' || jobStatus === 'processing'}
        >
          {jobId ? 'Run New Research' : 'Start Research'}
        </Button>
      </div>
      
      {focusText && (
        <div className="bg-accent/20 p-2 rounded-md">
          <Badge className="mb-1">Research Focus</Badge>
          <div className="text-sm">{focusText}</div>
        </div>
      )}
      
      {renderContent()}
    </Card>
  );
}
