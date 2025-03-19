
import { useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { ScrollArea } from "@/components/ui/scroll-area"
import { supabase } from "@/integrations/supabase/client"
import { Loader2 } from 'lucide-react'

interface AnalysisDisplayProps {
  content: string;
  isStreaming?: boolean;
  jobId?: string;
  iteration?: number;
  maxHeight?: string;
}

export function AnalysisDisplay({ 
  content, 
  isStreaming = false, 
  jobId,
  iteration = 0,
  maxHeight = '250px' 
}: AnalysisDisplayProps) {
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [lastChunkTime, setLastChunkTime] = useState<number>(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Always scroll to bottom when content updates
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollableElement) {
        scrollableElement.scrollTop = scrollableElement.scrollHeight;
      }
    }
  }, [content, streamingContent]);

  // Set up realtime streaming if needed
  useEffect(() => {
    if (!isStreaming || !jobId || iteration === undefined) {
      setStreamingContent('');
      return;
    }

    console.log(`Setting up realtime subscription for job ${jobId}, iteration ${iteration}`);
    
    // Initialize the streaming content
    setStreamingContent('');
    setLastChunkTime(Date.now());
    
    // Sort existing chunks to ensure correct order
    const fetchExistingChunks = async () => {
      console.log(`Fetching existing chunks for job ${jobId}, iteration ${iteration}`);
      
      const { data: existingChunks, error } = await supabase
        .from('analysis_stream')
        .select('chunk, sequence')
        .eq('job_id', jobId)
        .eq('iteration', iteration)
        .order('sequence', { ascending: true });
        
      if (error) {
        console.error('Error fetching existing chunks:', error);
        return;
      }
      
      if (existingChunks && existingChunks.length > 0) {
        console.log(`Found ${existingChunks.length} existing chunks for job ${jobId}, iteration ${iteration}`);
        
        // Instead of combining all at once, simulate gradual appearance
        const displayChunksGradually = async () => {
          const sortedChunks = existingChunks.sort((a, b) => a.sequence - b.sequence);
          
          for (let i = 0; i < sortedChunks.length; i++) {
            setStreamingContent(prev => prev + sortedChunks[i].chunk);
            setLastChunkTime(Date.now());
            // Add a slight delay between chunks for more natural appearance
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        };
        
        displayChunksGradually();
      } else {
        console.log(`No existing chunks found for job ${jobId}, iteration ${iteration}`);
      }
    };
    
    fetchExistingChunks();
    
    // Subscribe to new chunks
    console.log(`Creating realtime subscription for job ${jobId}, iteration ${iteration}`);
    
    const channel = supabase
      .channel(`analysis-stream-${jobId}-${iteration}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analysis_stream',
          filter: `job_id=eq.${jobId} AND iteration=eq.${iteration}`
        },
        (payload) => {
          console.log('New streaming chunk received:', payload);
          const newChunk = payload.new.chunk;
          
          setStreamingContent(prev => prev + newChunk);
          setLastChunkTime(Date.now());
        }
      )
      .subscribe((status) => {
        console.log(`Subscription status for job ${jobId}, iteration ${iteration}:`, status);
      });

    return () => {
      console.log(`Cleaning up realtime subscription for job ${jobId}, iteration ${iteration}`);
      supabase.removeChannel(channel);
    };
  }, [isStreaming, jobId, iteration]);

  const displayContent = isStreaming ? streamingContent || 'Loading...' : content;

  return (
    <ScrollArea className="p-1 w-full max-w-full h-full" ref={scrollAreaRef}>
      <div className="p-1 w-full max-w-full">
        {isStreaming && !streamingContent && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading analysis...</span>
          </div>
        )}
        <ReactMarkdown className="prose prose-sm prose-invert max-w-none overflow-x-auto">
          {displayContent}
        </ReactMarkdown>
      </div>
    </ScrollArea>
  );
}
