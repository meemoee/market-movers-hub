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
      if (data && ((data as any).status === 'completed' || (data as any).status === 'failed')) {
        return false;
      }
      return 5000;
    },
    refetchOnWindowFocus: false
  });
  
  useEffect(() => {
    if (jobData && (jobData as any).status) {
      setJobStatus((jobData as any).status as 'processing' | 'completed' | 'failed');
      
      if ((jobData as any).results && (jobData as any).results.length > 0 && onResultsChange) {
        onResultsChange((jobData as any).results);
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
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL is not defined');
      }

      const params = new URLSearchParams();
      params.append('queries', marketQuestion);
      if (marketId) params.append('marketId', marketId);
      if (focusText) params.append('focusText', focusText);
      
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      
      if (!authToken) {
        throw new Error('No authentication token available');
      }
      
      const sseUrl = `${supabaseUrl}/functions/v1/web-scrape?${params.toString()}`;

      const eventSource = new EventSource(sseUrl, {
        withCredentials: true,
      });
      
      if ('withCredentials' in eventSource) {
        console.log('EventSource supports credentials');
      } else {
        console.warn('EventSource does not support credentials, authentication may fail');
      }
      
      eventSourceRef.current = eventSource;

      await supabase.functions.invoke('web-scrape', {
        body: {
          queries: [marketQuestion],
          marketId,
          focusText
        }
      });
      
      setMessages(prev => [...prev, `Started research for: ${marketQuestion}`]);

      eventSource.onmessage = (event) => {
        try {
          if (event.data === '[DONE]') {
            eventSource.close();
            setIsSearching(false);
            return;
          }
          
          const data = JSON.parse(event.data);
          
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
            const newResults = data.data;
            
            if (newResults.length > 0) {
              const progressValue = Math.min(Math.round((newResults.length / 10) * 20) + progress, 95);
              setProgress(progressValue);
            }
            
            if (onResultsChange) {
              onResultsChange(newResults);
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
