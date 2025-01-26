import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from 'react-markdown';

interface MarketWebSearchCardProps {
  marketDescription: string;
}

export function MarketWebSearchCard({ marketDescription }: MarketWebSearchCardProps) {
  // State management
  const [isSearching, setIsSearching] = useState(false);
  const [websiteCount, setWebsiteCount] = useState(0);
  const [analysis, setAnalysis] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleSearch = async () => {
    // Input validation
    if (!marketDescription) {
      setError('Market description is required');
      return;
    }

    // Reset state
    cleanup();
    setIsSearching(true);
    setAnalysis("");
    setWebsiteCount(0);
    setError(null);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      console.log('Starting web research with description:', marketDescription);

      const { data, error } = await supabase.functions.invoke('web-research', {
        body: { description: marketDescription }
      });

      if (error) {
        console.error('Error invoking web-research function:', error);
        throw error;
      }

      console.log('Received response from web-research');
      
      // Set up stream handling
      const reader = new Response(data.body).body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Set global timeout
      timeoutRef.current = window.setTimeout(() => {
        cleanup();
        setError('Research timed out after 5 minutes');
        setIsSearching(false);
      }, 5 * 60 * 1000);

      while (true) {
        // Check if aborted
        if (!reader || abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        // Process chunks and handle partial messages
        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              console.log('Parsed streaming data:', parsed);

              // Handle different message types
              switch (parsed.type) {
                case 'websites':
                  setWebsiteCount(parsed.count);
                  break;
                case 'analysis':
                  setAnalysis(prev => prev + parsed.content);
                  break;
                case 'error':
                  throw new Error(parsed.message);
                default:
                  console.warn('Unknown message type:', parsed.type);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e, 'Raw line:', line);
              continue;
            }
          }
        }
      }

    } catch (error) {
      console.error('Error during web research:', error);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      cleanup();
      setIsSearching(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return (
    <Card className="p-4 mt-4">
      <div className="flex flex-col space-y-4">
        {/* Header with search button */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Web Research Analysis</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSearch}
            disabled={isSearching}
            className="flex items-center gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {websiteCount > 0 ? (
                  `Analyzing ${websiteCount} websites...`
                ) : (
                  'Starting analysis...'
                )}
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyze Market
              </>
            )}
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded-md">
            {error}
          </div>
        )}

        {/* Analysis display */}
        {(analysis || isSearching) && (
          <div className="relative">
            {/* Analysis content */}
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              <ReactMarkdown>
                {analysis || 'Analyzing market data...'}
              </ReactMarkdown>
            </div>

            {/* Loading overlay */}
            {isSearching && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">
                    {websiteCount > 0 ? (
                      `Processing data from ${websiteCount} sources...`
                    ) : (
                      'Gathering market data...'
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
