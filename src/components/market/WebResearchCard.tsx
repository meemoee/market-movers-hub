
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ResearchHeader } from './research/ResearchHeader';
import { ProgressDisplay } from './research/ProgressDisplay';
import { SitePreviewList } from './research/SitePreviewList';
import { AnalysisDisplay } from './research/AnalysisDisplay';

interface WebResearchCardProps {
  description: string;
  marketId: string;
}

export function WebResearchCard({ description, marketId }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Array<{ url: string; title: string; content: string }>>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [probability, setProbability] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);

  useEffect(() => {
    // Check for any existing research job for this market
    const checkExistingResearch = async () => {
      try {
        const { data, error } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('market_id', marketId)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (error) {
          console.error('Error checking existing research:', error);
          return;
        }
        
        if (data && data.length > 0) {
          const job = data[0];
          // Load previous results if they exist
          if (job.results && Array.isArray(job.results) && job.results.length > 0) {
            setResults(job.results as Array<{ url: string; title: string; content: string }>);
          }
          
          if (job.analysis) {
            setAnalysis(job.analysis);
          }
          
          if (job.probability) {
            setProbability(job.probability);
          }
          
          if (job.progress_log && Array.isArray(job.progress_log) && job.progress_log.length > 0) {
            setProgress(job.progress_log as string[]);
          }
        }
      } catch (error) {
        console.error('Error checking existing research:', error);
      }
    };
    
    if (marketId) {
      checkExistingResearch();
    }
  }, [marketId]);

  const handleResearch = async () => {
    if (isLoading || isAnalyzing) return;
    
    setIsLoading(true);
    setProgress([]);
    setResults([]);
    setAnalysis(null);
    setProbability(null);
    
    try {
      // Generate search queries
      const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
        body: { text: description, marketId },
      });
      
      if (queriesError) {
        console.error('Error generating queries:', queriesError);
        toast.error('Failed to generate search queries');
        setIsLoading(false);
        return;
      }
      
      const generatedQueries = queriesData.queries || [];
      if (generatedQueries.length === 0) {
        toast.error('No search queries could be generated');
        setIsLoading(false);
        return;
      }
      
      setProgress([`Generated ${generatedQueries.length} search queries`]);
      
      // Execute web scrape
      try {
        // Call the web-scrape function and get the JSON response
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('web-scrape', {
          body: { queries: generatedQueries, marketId, focusText: description },
        });
        
        if (scrapeError) {
          console.error('Web scrape error:', scrapeError);
          toast.error(`Research failed: ${scrapeError.message}`);
          setIsLoading(false);
          return;
        }
        
        if (!scrapeData) {
          toast.error('No data received from research function');
          setIsLoading(false);
          return;
        }

        console.log('Web scrape response:', scrapeData);
        
        let allResults: Array<{ url: string; title: string; content: string }> = [];
        
        // Process messages if they're returned as an array
        if (Array.isArray(scrapeData.messages)) {
          for (const message of scrapeData.messages) {
            if (message.type === 'message') {
              setProgress(prev => [...prev, message.message]);
            } else if (message.type === 'results' && Array.isArray(message.data)) {
              allResults = [...allResults, ...message.data];
              setResults([...allResults]);
            } else if (message.type === 'error') {
              toast.error(message.message);
              setProgress(prev => [...prev, `Error: ${message.message}`]);
            }
          }
        } else if (Array.isArray(scrapeData.results)) {
          // If results are directly returned
          allResults = scrapeData.results;
          setResults(allResults);
          setProgress(prev => [...prev, `Retrieved ${allResults.length} research results`]);
        } else {
          console.log('Unexpected response format:', scrapeData);
          toast.error('Unexpected response format from research function');
          setIsLoading(false);
          return;
        }
        
        if (allResults.length === 0) {
          toast.error('No research results found');
          setIsLoading(false);
          return;
        }
        
        setProgress(prev => [...prev, `Retrieved ${allResults.length} research results`]);
        
        // Analyze the results
        setIsAnalyzing(true);
        setIsLoading(false);
        
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-web-content', {
          body: { results: allResults, marketId, description },
        });
        
        if (analysisError) {
          console.error('Analysis error:', analysisError);
          toast.error(`Analysis failed: ${analysisError.message}`);
          setIsAnalyzing(false);
          return;
        }
        
        if (analysisData.analysis) {
          setAnalysis(analysisData.analysis);
        }
        
        if (analysisData.probability) {
          setProbability(analysisData.probability);
        }
        
        setProgress(prev => [...prev, 'Analysis complete']);
        
      } catch (error) {
        console.error('Research process error:', error);
        toast.error(`Research process failed: ${error.message}`);
      } finally {
        setIsLoading(false);
        setIsAnalyzing(false);
      }
      
    } catch (error) {
      console.error('Research error:', error);
      toast.error('An error occurred during research');
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <ResearchHeader 
          isLoading={isLoading} 
          isAnalyzing={isAnalyzing}
          onResearch={handleResearch}
        />
      </CardHeader>
      <CardContent>
        {progress.length > 0 && (
          <ProgressDisplay 
            messages={progress} 
          />
        )}
        
        {results.length > 0 && (
          <SitePreviewList results={results} />
        )}
        
        {analysis && (
          <AnalysisDisplay 
            content={analysis}
            isStreaming={false}
          />
        )}
      </CardContent>
    </Card>
  );
}
