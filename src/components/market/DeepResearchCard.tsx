
import { useEffect, useRef, useState } from 'react';
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

interface ResearchStep {
  query: string;
  results: string;
}

export function DeepResearchCard({ description, marketId }: DeepResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [researchResults, setResearchResults] = useState<ResearchReport | null>(null);
  const [steps, setSteps] = useState<ResearchStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup function for when component unmounts or when research is reset
  const cleanupStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return cleanupStream;
  }, []);

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
      // Reset all states
      setIsLoading(true);
      setSteps([]);
      setCurrentStepIndex(0);
      setResearchResults(null);
      setError(null);
      
      // Cleanup any existing stream
      cleanupStream();
      
      // Add initial step to immediately show something
      setSteps([{ query: `Initial research for: ${description.substring(0, 30)}...`, results: "Starting research..." }]);
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      // Call the edge function with streaming enabled
      const response = await fetch(`${supabase.functions.url}/deep-research-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.auth.session()?.access_token || ''}`,
          'apikey': supabase.supabaseKey
        },
        body: JSON.stringify({ description, marketId }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Edge function error: ${response.status} - ${errorData}`);
      }
      
      // Handle the SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get reader from response');
      }
      
      // Process the stream
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the incomplete message in the buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'step') {
                // Handle new step
                setSteps(prevSteps => {
                  const newSteps = [...prevSteps];
                  // Update existing step or add new one
                  const existingStepIndex = newSteps.findIndex(step => 
                    step.query === data.step.query);
                  
                  if (existingStepIndex >= 0) {
                    newSteps[existingStepIndex] = data.step;
                  } else {
                    newSteps.push(data.step);
                  }
                  return newSteps;
                });
                
                // Update current step index
                setCurrentStepIndex(prevIndex => {
                  const newIndex = prevIndex + 1;
                  return newIndex < steps.length ? newIndex : prevIndex;
                });
              } else if (data.type === 'report') {
                // Handle final report
                setResearchResults(data.report);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (err) {
              console.error('Error parsing SSE data:', err, line);
            }
          }
        }
      }
      
      setIsLoading(false);
    } catch (err) {
      console.error('Research error:', err);
      // Don't set error if it was aborted intentionally
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        
        toast({
          title: "Research Failed",
          description: err instanceof Error ? err.message : 'An unknown error occurred',
          variant: "destructive"
        });
      }
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    cleanupStream();
    setResearchResults(null);
    setSteps([]);
    setCurrentStepIndex(0);
    setError(null);
  };

  // Calculate current progress percentage
  const progressPercentage = steps.length > 0 
    ? Math.min(((currentStepIndex + 1) / steps.length) * 100, 100)
    : 0;

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
                Step {currentStepIndex + 1}/{steps.length || '?'}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1">{steps[currentStepIndex]?.query || 'Initializing research...'}</span>
            </div>
            
            <div className="w-full bg-accent/30 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-in-out"
                style={{ width: `${progressPercentage}%` }}
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
