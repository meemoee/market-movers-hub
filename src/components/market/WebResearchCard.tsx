
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

      // Create the research job via the supabase client
      const { data: jobResponse, error: jobError } = await supabase.functions.invoke('web-scrape', {
        body: { 
          description, 
          marketId 
        }
      });

      if (jobError) {
        throw new Error(`Failed to start research: ${jobError.message}`);
      }

      if (!jobResponse || !jobResponse.jobId) {
        throw new Error('Invalid response from research job creation');
      }

      // Poll for job status and updates
      const pollInterval = setInterval(async () => {
        try {
          const { data: jobStatus, error: statusError } = await supabase.functions.invoke('get-job-status', {
            body: { jobId: jobResponse.jobId }
          });

          if (statusError) {
            throw statusError;
          }

          if (!jobStatus) {
            return;
          }

          // Handle progress updates
          if (jobStatus.progress) {
            setCurrentProgress(jobStatus.progress);
            if (jobStatus.progress.message) {
              setProgressMessages(prev => [...prev, jobStatus.progress.message]);
            }
          }

          // Handle search results
          if (jobStatus.searchResults && jobStatus.searchResults.length > 0) {
            setSearchResults(jobStatus.searchResults);
          }

          // Handle status changes
          if (jobStatus.status === 'analyzing') {
            setIsLoading(false);
            setIsAnalyzing(true);
            setProgressMessages(prev => [...prev, 'Search complete. Analyzing results...']);
          } else if (jobStatus.status === 'completed') {
            setIsLoading(false);
            setIsAnalyzing(false);
            setProgressMessages(prev => [...prev, 'Research completed.']);
            
            // Get the analysis results
            if (jobStatus.analysis) {
              setAnalysisResults(jobStatus.analysis);
            }
            
            clearInterval(pollInterval);
          } else if (jobStatus.status === 'failed') {
            throw new Error(jobStatus.error || 'Research job failed');
          }
        } catch (err) {
          console.error('Error polling job status:', err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
          setIsLoading(false);
          setIsAnalyzing(false);
          clearInterval(pollInterval);
          toast.error('Research polling failed. Please try again.');
        }
      }, 2000);

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
