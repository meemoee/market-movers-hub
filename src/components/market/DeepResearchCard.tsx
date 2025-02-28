
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEventListener } from '@/hooks/use-event-listener';

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
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const { toast } = useToast();

  // Clean up the abort controller on unmount or when changing
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

  // Listen for visibility changes to handle browser tab switching
  useEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isLoading && abortController) {
      // If the user switches tabs while loading, cancel the current request
      abortController.abort();
    }
  });

  const processStreamChunk = (chunk: string) => {
    if (!chunk || chunk === '') return;
    
    try {
      // Handle different message formats that might come from the stream
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim();
        
        // Skip the [DONE] message
        if (jsonStr === '[DONE]') return;
        
        try {
          const data = JSON.parse(jsonStr);
          
          if (data.type === 'progress') {
            // Handle progress updates
            if (data.iteration !== undefined) {
              setIteration(data.iteration);
            }
            if (data.totalIterations !== undefined) {
              setTotalIterations(data.totalIterations);
            }
            if (data.query) {
              setCurrentQuery(data.query);
            }
          } 
          else if (data.type === 'report' && data.report) {
            // Handle final report
            setResearchResults(data.report);
          }
        } catch (e) {
          console.warn('Error parsing SSE data:', e);
        }
      }
    } catch (e) {
      console.error('Error processing stream chunk:', e);
    }
  };

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
      // Reset state
      setIsLoading(true);
      setIteration(0);
      setError(null);
      setCurrentQuery('Initializing research...');
      setResearchResults(null);
      
      // Create a new abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);
      
      // Call the edge function with streaming enabled
      const response = await supabase.functions.invoke('deep-research', {
        body: { description, marketId, stream: true },
        signal: controller.signal
      });
      
      if (response.error) {
        throw new Error(`Edge function error: ${response.error.message}`);
      }
      
      // Process the streaming response
      const reader = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder();
          const streamReader = new Response(response.data.body).body?.getReader();
          
          function push() {
            streamReader?.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                setIsLoading(false);
                return;
              }
              
              const chunk = textDecoder.decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                processStreamChunk(line);
              }
              
              push();
            }).catch(err => {
              console.error('Stream reading error:', err);
              setError(err instanceof Error ? err.message : 'An error occurred while processing research');
              setIsLoading(false);
              controller.error(err);
            });
          }
          
          push();
        }
      });

      const streamReader = reader.getReader();
      while (true) {
        const { done } = await streamReader.read();
        if (done) break;
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
    } finally {
      setAbortController(null);
    }
  };

  const handleReset = () => {
    setResearchResults(null);
    setIteration(0);
    setCurrentQuery('');
    setError(null);
  };

  // Calculate progress percentage
  const progressPercentage = totalIterations > 0 
    ? Math.min(Math.round((iteration / totalIterations) * 100), 100) 
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
