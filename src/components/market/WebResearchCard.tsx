
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
  const [progressMessages, setProgressMessages] = useState<string[]>([]);

  const handleStartResearch = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSearchResults([]);
      setAnalysisResults(null);
      setCurrentProgress(null);
      setProgressMessages(['Starting research...']);

      // Construct the fully qualified URL string instead of using the protected url property
      const supabaseUrl = supabase.functions.url
      const functionsUrl = `${supabaseUrl}/web-scrape?description=${encodeURIComponent(description)}&marketId=${encodeURIComponent(marketId)}`;
      const eventSource = new EventSource(functionsUrl);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          console.log('Web research message:', data.message);
          // Add message to progress messages
          setProgressMessages(prev => [...prev, data.message]);
        } else if (data.type === 'progress') {
          setCurrentProgress(data.progress);
          // Add progress message to messages array
          if (data.progress && data.progress.message) {
            setProgressMessages(prev => [...prev, data.progress.message]);
          }
        } else if (data.type === 'results') {
          setSearchResults(data.data || []);
          setIsLoading(false);
          setIsAnalyzing(true);
          setProgressMessages(prev => [...prev, 'Search complete. Analyzing results...']);
        } else if (data.type === 'error') {
          setError(data.message);
          setIsLoading(false);
          setIsAnalyzing(false);
          eventSource.close();
          toast.error(`Research error: ${data.message}`);
          setProgressMessages(prev => [...prev, `Error: ${data.message}`]);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        setError('Connection error. Please try again later.');
        setIsLoading(false);
        setIsAnalyzing(false);
        eventSource.close();
        toast.error('Research connection lost. Please try again.');
        setProgressMessages(prev => [...prev, 'Connection error. Please try again later.']);
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
          setProgressMessages(prev => [...prev, 'Analysis complete.']);
        } catch (error) {
          console.error('Analysis error:', error);
          setError('Failed to analyze research results.');
          setIsAnalyzing(false);
          toast.error('Analysis failed. Please try again.');
          setProgressMessages(prev => [...prev, 'Analysis failed. Please try again.']);
        }
        
        eventSource.close();
      });

    } catch (err) {
      console.error('Research error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsLoading(false);
      setIsAnalyzing(false);
      toast.error('Research failed to start. Please try again.');
      setProgressMessages(prev => [...prev, 'Research failed to start. Please try again.']);
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
        
        {currentProgress && progressMessages.length > 0 && (
          <ProgressDisplay messages={progressMessages} />
        )}
        
        {searchResults.length > 0 && (
          <SitePreviewList results={searchResults} />
        )}
        
        {analysisResults && (
          <AnalysisDisplay content={JSON.stringify(analysisResults, null, 2)} />
        )}
      </CardContent>
    </Card>
  );
}
