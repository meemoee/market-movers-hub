
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DeepResearchCardProps {
  description?: string;
  marketId: string;
}

interface ResearchReport {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  analysis: string;
  conclusion: string;
}

export function DeepResearchCard({ description, marketId }: DeepResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [researchResults, setResearchResults] = useState<ResearchReport | null>(null);
  const [iteration, setIteration] = useState(0);
  const [totalIterations, setTotalIterations] = useState(5);
  const [currentQuery, setCurrentQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Use a ref to maintain the job ID across research iterations
  const jobIdRef = useRef<string | null>(null);

  const handleStartResearch = async () => {
    if (!description) {
      toast({
        title: "Missing information",
        description: "A market description is required to start research.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      setIteration(1);
      setError(null);
      setCurrentQuery(`Initial query for: ${description.substring(0, 30)}...`);
      
      // First call to deep-research, passing jobIdRef.current which will be null on first run
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        report?: ResearchReport;
        steps?: { query: string; results: string }[];
        error?: string;
        job_id?: string;
        current_iteration?: number;
        total_iterations?: number;
        is_complete?: boolean;
        next_query?: string;
      }>('deep-research', {
        body: { 
          description, 
          marketId,
          job_id: jobIdRef.current
        }
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (!data.success || data.error) {
        throw new Error(data.error || 'Unknown error occurred');
      }
      
      console.log('Research data received:', data);
      
      // Store the job ID for subsequent calls
      if (data.job_id) {
        jobIdRef.current = data.job_id;
        console.log(`Using job ID: ${data.job_id}`);
      }
      
      if (data.current_iteration) {
        setIteration(data.current_iteration);
      }
      
      if (data.total_iterations) {
        setTotalIterations(data.total_iterations);
      }
      
      // If we have steps, visualize them
      if (data.steps && data.steps.length > 0) {
        let currentStep = 0;
        const interval = setInterval(() => {
          if (currentStep < data.steps!.length) {
            setCurrentQuery(data.steps![currentStep].query);
            currentStep++;
          } else {
            clearInterval(interval);
            
            // If research is NOT complete, start the next iteration
            if (data.is_complete === false && data.next_query) {
              // Wait a moment before starting next iteration to show completion of current one
              setTimeout(() => {
                continuteResearch(data.next_query!);
              }, 1500);
            } else {
              // Research is complete, show final results
              if (data.report) {
                setResearchResults(data.report);
              }
              setIsLoading(false);
            }
          }
        }, 1000);
      } else {
        // If no steps but we have a report, show it
        if (data.report) {
          setResearchResults(data.report);
        }
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Research error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsLoading(false);
      
      toast({
        title: "Research Failed",
        description: err instanceof Error ? err.message : 'An unknown error occurred',
        variant: "destructive"
      });
    }
  };

  // New function to continue research with subsequent iterations
  const continuteResearch = async (nextQuery: string) => {
    if (!jobIdRef.current) {
      console.error('Cannot continue research: no job ID');
      setError('Research job not properly initialized');
      setIsLoading(false);
      return;
    }
    
    try {
      // Increment iteration counter for UI
      const nextIteration = iteration + 1;
      setIteration(nextIteration);
      setCurrentQuery(nextQuery);
      
      console.log(`Starting research iteration ${nextIteration} with job ID ${jobIdRef.current}`);
      
      // Call the same function but with the stored job ID to continue research
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        report?: ResearchReport;
        steps?: { query: string; results: string }[];
        error?: string;
        job_id?: string;
        current_iteration?: number;
        is_complete?: boolean;
        next_query?: string;
      }>('deep-research', {
        body: { 
          description, 
          marketId,
          job_id: jobIdRef.current,
          iteration: nextIteration
        }
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (!data.success || data.error) {
        throw new Error(data.error || 'Unknown error occurred');
      }
      
      console.log(`Iteration ${nextIteration} data:`, data);
      
      if (data.steps && data.steps.length > 0) {
        let currentStep = 0;
        const interval = setInterval(() => {
          if (currentStep < data.steps!.length) {
            setCurrentQuery(data.steps![currentStep].query);
            currentStep++;
          } else {
            clearInterval(interval);
            
            // If research is not complete, continue to next iteration
            if (data.is_complete === false && data.next_query) {
              setTimeout(() => {
                continuteResearch(data.next_query!);
              }, 1500);
            } else {
              // Research is complete, show final results
              if (data.report) {
                setResearchResults(data.report);
              }
              setIsLoading(false);
            }
          }
        }, 1000);
      } else {
        if (data.report) {
          setResearchResults(data.report);
        }
        setIsLoading(false);
      }
    } catch (err) {
      console.error(`Error in research iteration ${iteration}:`, err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResearchResults(null);
    setIteration(0);
    setCurrentQuery('');
    setError(null);
    jobIdRef.current = null;
  };

  return (
    <Card className="bg-background/70 backdrop-blur-sm border-muted">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Deep Research
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Research in progress...</div>
              <div className="text-sm text-muted-foreground">
                Iteration {iteration}/{totalIterations}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1">{currentQuery}</span>
            </div>
            
            <div className="w-full bg-accent/30 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-in-out"
                style={{ width: `${(iteration / totalIterations) * 100}%` }}
              />
            </div>
            
            <div className="flex justify-center pt-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
        ) : researchResults ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">{researchResults.title}</h3>
              <p className="text-xs text-muted-foreground">
                {researchResults.executiveSummary}
              </p>
            </div>
            
            {researchResults.keyFindings && researchResults.keyFindings.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Key Findings</h4>
                <ul className="text-xs space-y-1 list-disc pl-4">
                  {researchResults.keyFindings.map((finding, index) => (
                    <li key={index} className="text-muted-foreground">{finding}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <div>
              <h4 className="text-xs font-semibold mb-1">Conclusion</h4>
              <p className="text-xs text-muted-foreground">
                {researchResults.conclusion}
              </p>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full flex gap-2 mt-2"
              onClick={handleReset}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Research
            </Button>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs text-destructive">
              Error: {error}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={handleStartResearch}
            >
              Retry Research
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Conduct deep, iterative research on this market using AI to generate insights and analysis.
            </p>
            
            <Button 
              variant="default" 
              size="sm" 
              className="w-full"
              onClick={handleStartResearch}
              disabled={!description}
            >
              Start Deep Research
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
