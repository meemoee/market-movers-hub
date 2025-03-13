
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { AnalysisDisplay } from './research/AnalysisDisplay';
import { ProgressDisplay } from './research/ProgressDisplay';
import { SitePreviewList } from './research/SitePreviewList';
import { ResearchHeader } from './research/ResearchHeader';
import { toast } from 'sonner';

export interface WebResearchCardProps {
  description: string;
  marketId: string;
  latestJob?: {
    id: string;
    status: string;
    [key: string]: any;
  };
}

export function WebResearchCard({ description, marketId, latestJob }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ url: string; title?: string; content: string }>>([]);
  const [analysisResults, setAnalysisResults] = useState<{ [key: string]: any } | null>(null);
  const [currentProgress, setCurrentProgress] = useState<{ step: string; message: string; percentage?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartResearch = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSearchResults([]);
      setAnalysisResults(null);
      setCurrentProgress(null);

      const eventSource = new EventSource(
        `${supabase.functions.url}/web-scrape?description=${encodeURIComponent(description)}&marketId=${encodeURIComponent(marketId)}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          console.log('Web research message:', data.message);
        } else if (data.type === 'progress') {
          setCurrentProgress(data.progress);
        } else if (data.type === 'results') {
          setSearchResults(data.data || []);
          setIsLoading(false);
          setIsAnalyzing(true);
        } else if (data.type === 'error') {
          setError(data.message);
          setIsLoading(false);
          setIsAnalyzing(false);
          eventSource.close();
          toast.error(`Research error: ${data.message}`);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        setError('Connection error. Please try again later.');
        setIsLoading(false);
        setIsAnalyzing(false);
        eventSource.close();
        toast.error('Research connection lost. Please try again.');
      };

      // When results are received, analyze them
      eventSource.addEventListener('results', async (event) => {
        const data = JSON.parse(event.data);
        setSearchResults(data.data || []);
        
        try {
          const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-web-content', {
            body: { 
              content: data.data,
              prompt: description,
              returnFormat: 'json'
            }
          });
          
          if (analysisError) {
            throw analysisError;
          }
          
          setAnalysisResults(analysisData);
          setIsAnalyzing(false);
        } catch (error) {
          console.error('Analysis error:', error);
          setError('Failed to analyze research results.');
          setIsAnalyzing(false);
          toast.error('Analysis failed. Please try again.');
        }
        
        eventSource.close();
      });

    } catch (err) {
      console.error('Research error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsLoading(false);
      setIsAnalyzing(false);
      toast.error('Research failed to start. Please try again.');
    }
  };

  return (
    <Card className="bg-background border-border">
      <CardContent className="p-4 space-y-4">
        <ResearchHeader 
          isLoading={isLoading} 
          isAnalyzing={isAnalyzing} 
          onResearch={handleStartResearch}
          jobStatus={latestJob?.status}
        />
        
        {error && <div className="text-sm text-destructive">{error}</div>}
        
        {currentProgress && (
          <ProgressDisplay progress={currentProgress} />
        )}
        
        {searchResults.length > 0 && (
          <SitePreviewList sites={searchResults} />
        )}
        
        {analysisResults && (
          <AnalysisDisplay analysis={analysisResults} />
        )}
      </CardContent>
    </Card>
  );
}
