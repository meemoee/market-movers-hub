
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ProgressDisplay } from './research/ProgressDisplay';
import { useQuery } from '@tanstack/react-query';

interface WebResearchCardProps {
  marketId: string;
  marketQuestion: string;
  focusText?: string;
  onResultsChange?: (results: Array<{
    url: string;
    title?: string;
    content: string;
  }>) => void;
}

export function WebResearchCard({ marketId, marketQuestion, focusText, onResultsChange }: WebResearchCardProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'processing' | 'completed' | 'failed' | null>(null);
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Poll for job status if we have a jobId and are not streaming
  const { data: jobData, isLoading, isError } = useQuery({
    queryKey: ['job-status', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      
      const { data, error } = await supabase.functions.invoke('get-job-status', {
        body: { jobId }
      });
      
      if (error) throw error;
      return data;
    },
    enabled: !!jobId && !isSearching,
    refetchInterval: (data) => {
      // Stop polling if job is completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 5000;
    },
    refetchOnWindowFocus: false
  });
  
  // Update job status from polling data
  useEffect(() => {
    if (jobData && jobData.status) {
      setJobStatus(jobData.status as 'processing' | 'completed' | 'failed');
      
      // If we got results from polling, update them
      if (jobData.results && jobData.results.length > 0 && onResultsChange) {
        onResultsChange(jobData.results);
      }
    }
  }, [jobData, onResultsChange]);

  const startSearch = async () => {
    if (isSearching) return;
    
    try {
      setIsSearching(true);
      setMessages([]);
      setJobId(null);
      setJobStatus(null);
      setProgress(0);
      
      // Close any existing event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Call the web-scrape function with Server-Sent Events
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.auth.getSession().then(res => res.data.session?.access_token)}`
        },
        body: JSON.stringify({
          queries: [marketQuestion],
          marketId,
          focusText
        })
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get reader from response');

      const results: Array<{
        url: string;
        title?: string;
        content: string;
      }> = [];

      // Create a new EventSource
      const eventSource = new EventSource(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-scrape?queries=${encodeURIComponent(marketQuestion)}&marketId=${encodeURIComponent(marketId)}${focusText ? `&focusText=${encodeURIComponent(focusText)}` : ''}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          if (event.data === '[DONE]') {
            eventSource.close();
            setIsSearching(false);
            return;
          }
          
          const data = JSON.parse(event.data);
          
          // Handle different message types
          if (data.type === 'message' && data.message) {
            setMessages(prev => [...prev, data.message]);
          } 
          else if (data.type === 'job_created' && data.jobId) {
            setJobId(data.jobId);
            setJobStatus('processing');
            setMessages(prev => [...prev, `Job created: ${data.jobId.substring(0, 8)}...`]);
          }
          else if (data.type === 'job_status' && data.status) {
            setJobStatus(data.status as 'processing' | 'completed' | 'failed');
            setMessages(prev => [...prev, `Job status: ${data.status}`]);
            
            if (data.status === 'completed') {
              setProgress(100);
            }
          }
          else if (data.type === 'results' && data.data) {
            // Add URLs to results
            const newResults = data.data;
            results.push(...newResults);
            
            // Calculate approximate progress
            if (results.length > 0) {
              // Assume average of 50 results is "complete"
              const progressValue = Math.min(Math.round((results.length / 50) * 100), 95);
              setProgress(progressValue);
            }
            
            // Notify parent component
            if (onResultsChange) {
              onResultsChange(results);
            }
          }
          else if (data.type === 'error') {
            toast({
              title: 'Error',
              description: data.message || 'An error occurred during research',
              variant: 'destructive',
            });
            setJobStatus('failed');
          }
        } catch (error) {
          console.error('Error processing SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        setIsSearching(false);
        
        toast({
          title: 'Connection Error',
          description: 'The research connection was lost. You can try again or check job status.',
          variant: 'destructive',
        });
      };

    } catch (error) {
      console.error('Search error:', error);
      setIsSearching(false);
      
      toast({
        title: 'Search Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const resetSearch = () => {
    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    setIsSearching(false);
    setMessages([]);
    setJobId(null);
    setJobStatus(null);
    setProgress(0);
    
    if (onResultsChange) {
      onResultsChange([]);
    }
  };
  
  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <Card className="bg-background/70 backdrop-blur-sm border-muted">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Search className="h-4 w-4" />
          Web Research
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <ProgressDisplay 
            messages={messages} 
            jobId={jobId || undefined} 
            jobStatus={jobStatus || undefined}
            progress={progress}
          />
          
          <div className="flex gap-2">
            <Button
              onClick={startSearch}
              disabled={isSearching}
              className="w-full"
              size="sm"
            >
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Researching...
                </>
              ) : (
                'Start Research'
              )}
            </Button>
            
            {(messages.length > 0 || jobId) && (
              <Button
                onClick={resetSearch}
                variant="outline"
                size="sm"
                className="flex-shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
