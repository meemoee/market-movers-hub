
import { useState, useEffect, useRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/Markdown"
import { cn } from "@/lib/utils"
import { Check, Eye } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"

interface AnalysisDisplayProps {
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
  isReasoningStreaming?: boolean;
  maxHeight?: string;
  jobId?: string;
  iterationNumber?: number;
}

export function AnalysisDisplay({ 
  content, 
  reasoning,
  isStreaming = false,
  isReasoningStreaming = false,
  maxHeight = '400px',
  jobId,
  iterationNumber
}: AnalysisDisplayProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [streamContent, setStreamContent] = useState(content);
  const [streamReasoning, setStreamReasoning] = useState(reasoning || '');
  const contentRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);
  const realtimeChannelRef = useRef<any>(null);
  const lastSequenceRef = useRef<number>(-1);
  
  // Start with the initial content
  useEffect(() => {
    if (!isStreaming) {
      setStreamContent(content);
    }
  }, [content, isStreaming]);
  
  // Start with the initial reasoning
  useEffect(() => {
    if (!isReasoningStreaming) {
      setStreamReasoning(reasoning || '');
    }
  }, [reasoning, isReasoningStreaming]);

  // Subscribe to real-time updates from analysis_stream if jobId and iterationNumber are provided
  useEffect(() => {
    if (jobId && iterationNumber !== undefined && isStreaming) {
      console.log(`Setting up realtime subscription for job ${jobId}, iteration ${iterationNumber}`);
      
      // First, fetch existing chunks
      const fetchExistingChunks = async () => {
        try {
          const { data, error } = await supabase
            .from('analysis_stream')
            .select('chunk, sequence')
            .eq('job_id', jobId)
            .eq('iteration', iterationNumber)
            .order('sequence', { ascending: true });
            
          if (error) {
            console.error('Error fetching existing chunks:', error);
            return;
          }
          
          if (data && data.length > 0) {
            // Accumulate all chunks and update the sequence counter
            const accumulatedContent = data.reduce((acc, item) => {
              lastSequenceRef.current = Math.max(lastSequenceRef.current, item.sequence);
              return acc + item.chunk;
            }, '');
            
            setStreamContent(prev => {
              // Don't append if it would be duplicate content
              if (prev.includes(accumulatedContent)) {
                return prev;
              }
              return accumulatedContent;
            });
            
            console.log(`Loaded ${data.length} existing chunks, last sequence: ${lastSequenceRef.current}`);
          }
        } catch (e) {
          console.error('Error in fetchExistingChunks:', e);
        }
      };
      
      fetchExistingChunks();
      
      // Set up realtime subscription for new chunks
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
      
      const channel = supabase.channel(`analysis_stream_${jobId}_${iterationNumber}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'analysis_stream',
          filter: `job_id=eq.${jobId}`,
        }, (payload) => {
          // Only process chunks for our specific iteration
          if (payload.new && payload.new.iteration === iterationNumber) {
            // Check if this is a new chunk (higher sequence than what we've seen)
            if (payload.new.sequence > lastSequenceRef.current) {
              console.log(`Received new chunk with sequence ${payload.new.sequence}`);
              lastSequenceRef.current = payload.new.sequence;
              
              // Append the new chunk to our content
              setStreamContent(prev => prev + payload.new.chunk);
            }
          }
        })
        .subscribe();
      
      realtimeChannelRef.current = channel;
      
      return () => {
        if (realtimeChannelRef.current) {
          console.log('Removing realtime subscription');
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      };
    }
  }, [jobId, iterationNumber, isStreaming]);
  
  useEffect(() => {
    // Auto-scroll to bottom when content is streaming
    if (isStreaming && contentRef.current) {
      const scrollElement = contentRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [streamContent, isStreaming]);

  useEffect(() => {
    // Auto-scroll reasoning to bottom when streaming
    if (isReasoningStreaming && reasoningRef.current && showReasoning) {
      const scrollElement = reasoningRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [streamReasoning, isReasoningStreaming, showReasoning]);

  // Determine what content to display based on streaming state
  const displayContent = isStreaming ? streamContent : content;
  const displayReasoning = isReasoningStreaming ? streamReasoning : reasoning;

  return (
    <div className="flex flex-col h-full">
      {reasoning && (
        <div className="flex justify-end mb-2">
          <ToggleGroup type="single" value={showReasoning ? "reasoning" : "analysis"} onValueChange={value => setShowReasoning(value === "reasoning")}>
            <ToggleGroupItem value="analysis" aria-label="Show analysis" className="text-xs px-2 py-1">
              <Check className="h-3 w-3 mr-1" />
              Analysis
            </ToggleGroupItem>
            <ToggleGroupItem value="reasoning" aria-label="Show reasoning" className="text-xs px-2 py-1">
              <Eye className="h-3 w-3 mr-1" />
              Reasoning
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      
      <div className={cn("h-full overflow-hidden", showReasoning ? "hidden" : "block")} ref={contentRef}>
        <ScrollArea className="h-full" style={{ maxHeight }}>
          <div className="p-2">
            <Markdown>
              {displayContent}
              {isStreaming && <span className="animate-pulse">▌</span>}
            </Markdown>
          </div>
        </ScrollArea>
      </div>
      
      {reasoning && (
        <div className={cn("h-full overflow-hidden", showReasoning ? "block" : "hidden")} ref={reasoningRef}>
          <ScrollArea className="h-full" style={{ maxHeight }}>
            <div className="p-2 bg-muted/20">
              <Markdown>
                {displayReasoning}
                {isReasoningStreaming && <span className="animate-pulse">▌</span>}
              </Markdown>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
