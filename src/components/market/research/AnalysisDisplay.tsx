
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

    // Initialize the streaming content
    setStreamingContent('');
    
    console.log(`Setting up realtime subscription for job ${jobId}, iteration ${iteration}`);
    
    // Sort existing chunks to ensure correct order
    const fetchExistingChunks = async () => {
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
        const sortedChunks = existingChunks.sort((a, b) => a.sequence - b.sequence);
        const combinedContent = sortedChunks.map(chunk => chunk.chunk).join('');
        setStreamingContent(combinedContent);
      }
    };
    
    fetchExistingChunks();
    
    // Subscribe to new chunks
    const channel = supabase
      .channel('analysis-stream')
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
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up realtime subscription');
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
