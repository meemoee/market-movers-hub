
import { useState, useEffect } from 'react';
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
  const [iteration, setIteration] = useState(0);
  const [totalIterations, setTotalIterations] = useState(5);
  const [currentQuery, setCurrentQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ResearchStep[]>([]);
  const { toast } = useToast();

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
      // Reset states
      setIsLoading(true);
      setIteration(0);
      setError(null);
      setCurrentQuery('Initializing research...');
      setSteps([]);
      setResearchResults(null);
      
      // Initialize the request to the edge function
      const response = await fetch(`${supabase.functions.url}/deep-research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.auth.session()?.access_token || ''}`,
          'apikey': process.env.SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({ description, marketId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        // Decode and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete messages in buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          
          const jsonStr = line.replace('data: ', '');
          if (jsonStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(jsonStr);
            console.log('Stream update:', data);
            
            if (data.type === 'step') {
              // Update with a new research step
              const newStep = data.data as ResearchStep;
              setSteps(prev => [...prev, newStep]);
              setIteration(prev => prev + 1);
              setCurrentQuery(newStep.query);
              setTotalIterations(data.total || 5);
            } 
            else if (data.type === 'progress') {
              // Update progress information
              setCurrentQuery(data.message || 'Researching...');
              if (data.currentStep) setIteration(data.currentStep);
              if (data.totalSteps) setTotalIterations(data.totalSteps);
            }
            else if (data.type === 'report') {
              // Final report received
              setResearchResults(data.data as ResearchReport);
            }
            else if (data.type === 'error') {
              throw new Error(data.message || 'Unknown error during research');
            }
          } catch (e) {
            console.error('Error parsing streaming data:', e, jsonStr);
          }
        }
      }
      
      setIsLoading(false);
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

  const handleReset = () => {
    setResearchResults(null);
    setIteration(0);
    setCurrentQuery('');
    setError(null);
    setSteps([]);
  };

  // Automatic scroll to latest research step
  useEffect(() => {
    if (steps.length > 0) {
      const progressElement = document.getElementById('research-progress');
      if (progressElement) {
        progressElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [steps]);

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
          <div className="space-y-3" id="research-progress">
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
            
            {steps.length > 0 && (
              <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
                {steps.map((step, index) => (
                  <div key={index} className="text-xs border border-border p-2 rounded-md">
                    <div className="font-medium">Query {index + 1}: {step.query}</div>
                    {step.results && (
                      <div className="text-muted-foreground mt-1 text-xs line-clamp-2">
                        {step.results.length > 100 
                          ? `${step.results.substring(0, 100)}...` 
                          : step.results}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
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
