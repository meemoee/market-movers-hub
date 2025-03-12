
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
      const response = await supabase.functions.invoke('web-scrape', {
        body: { queries: generatedQueries, marketId, focusText: description },
      });
      
      if (response.error) {
        console.error('Web scrape error:', response.error);
        toast.error(`Research failed: ${response.error.message}`);
        setIsLoading(false);
        return;
      }
      
      const reader = response.data.getReader();
      const decoder = new TextDecoder();
      let allResults: Array<{ url: string; title: string; content: string }> = [];
      
      // Process the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data:')) continue;
          
          const data = line.replace('data:', '').trim();
          
          if (data === '[DONE]') {
            // Stream complete
            continue;
          }
          
          try {
            const parsed = JSON.parse(data) as { 
              type: string; 
              message?: string; 
              data?: Array<{ url: string; title: string; content: string }> 
            };
            
            if (parsed.type === 'message' && parsed.message) {
              setProgress(prev => [...prev, parsed.message]);
            }
            
            if (parsed.type === 'results' && parsed.data) {
              allResults = [...allResults, ...parsed.data];
              setResults([...allResults]);
            }
            
            if (parsed.type === 'error' && parsed.message) {
              setProgress(prev => [...prev, `Error: ${parsed.message}`]);
              toast.error(parsed.message);
            }
          } catch (e) {
            console.error('Error parsing stream data:', e, data);
          }
        }
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
      setIsAnalyzing(false);
      
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
