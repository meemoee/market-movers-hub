
import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Clipboard, CheckCircle, Loader, ExternalLink } from "lucide-react";
import { SitePreviewList } from "./SitePreviewList";
import { AnalysisDisplay } from "./AnalysisDisplay";
import { toast } from "@/components/ui/use-toast";
import { setupSSEConnection, closeSSEConnection, StreamEventType } from "@/utils/sse-helpers";

interface IterationCardProps {
  iteration: {
    iteration: number;
    query: string;
    results: any[];
    analysis?: string;
    processing?: boolean;
  };
  isExpanded: boolean;
  isStreaming?: boolean;
  isCurrentIteration?: boolean;
  maxIterations?: number;
  onToggleExpand: () => void;
  onStartStreaming?: (iteration: number) => void;
}

export function IterationCard({ 
  iteration, 
  isExpanded,
  isStreaming = false,
  isCurrentIteration = false,
  maxIterations = 3,
  onToggleExpand,
  onStartStreaming
}: IterationCardProps) {
  const [analysis, setAnalysis] = useState(iteration.analysis || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContentStreaming, setIsContentStreaming] = useState(isStreaming);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(analysis);
    toast({
      title: "Copied to clipboard",
      description: "The analysis has been copied to your clipboard",
    });
  };

  const handleStartStreaming = async (jobId: string, iterationNum: number) => {
    setLoading(true);
    setError(null);
    setIsContentStreaming(true);
    
    try {
      if (onStartStreaming) {
        onStartStreaming(iterationNum);
      }
      
      // Set up SSE connection for streaming the analysis
      const SUPABASE_PROJECT_ID = 'lfmkoismabbhujycnqpn';
      const functionUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/extract-research-insights`;
      const streamUrl = `${functionUrl}?stream=true&jobId=${jobId}&iteration=${iterationNum}`;
      
      const connection = setupSSEConnection(streamUrl, {
        retryLimit: 3,
        retryDelay: 1500,
        onStart: () => {
          console.log(`Started streaming analysis for iteration ${iterationNum}`);
          // Clear existing analysis if we're starting fresh
          if (!analysis) {
            setAnalysis('');
          }
        },
        onContent: (content) => {
          setAnalysis(prev => prev + content);
        },
        onError: (err) => {
          console.error(`Stream error for iteration ${iterationNum}:`, err);
          setError(`Error streaming analysis: ${err.message}`);
          setIsContentStreaming(false);
        },
        onComplete: () => {
          console.log(`Completed streaming analysis for iteration ${iterationNum}`);
          setIsContentStreaming(false);
        },
        onHeartbeat: () => {
          console.debug(`Received heartbeat for iteration ${iterationNum}`);
        }
      });
      
      return () => {
        closeSSEConnection(connection);
      };
    } catch (e) {
      console.error('Error setting up streaming:', e);
      setError(`Error setting up streaming: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setIsContentStreaming(false);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card className="overflow-hidden">
      <div
        className={`p-4 cursor-pointer flex items-center justify-between ${
          isCurrentIteration ? 'bg-primary/10' : ''
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center space-x-2">
          <span className="font-medium text-sm">
            Iteration {iteration.iteration} of {maxIterations}
            {isCurrentIteration && (
              <span className="ml-2 text-xs bg-primary/20 py-0.5 px-1.5 rounded-full">
                Current
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {isStreaming && (
            <div className="flex items-center mr-2">
              <Loader className="w-3 h-3 text-primary mr-1 animate-spin" />
              <span className="text-xs text-muted-foreground">Streaming</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4 border-t space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Search Query</h4>
            </div>
            <div className="text-sm bg-accent/5 p-2 rounded-md">
              {iteration.query}
            </div>
          </div>
          
          {iteration.results && iteration.results.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Search Results</h4>
              <SitePreviewList results={iteration.results} />
            </div>
          )}
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Analysis</h4>
              <div className="flex space-x-2">
                {analysis && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2" 
                    onClick={copyToClipboard}
                  >
                    <Clipboard className="h-3 w-3 mr-1" />
                    <span className="text-xs">Copy</span>
                  </Button>
                )}
              </div>
            </div>
            
            {error && (
              <div className="text-sm text-red-500 mb-2">
                {error}
              </div>
            )}
            
            {analysis ? (
              <AnalysisDisplay 
                content={analysis} 
                isStreaming={isContentStreaming} 
                maxHeight="300px" 
              />
            ) : loading ? (
              <div className="flex items-center justify-center p-4 bg-accent/5 rounded-md">
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                <span className="text-sm">Loading analysis...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 bg-accent/5 rounded-md">
                <span className="text-sm text-muted-foreground mb-2">No analysis available</span>
                {iteration.iteration && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStartStreaming('job123', iteration.iteration)}
                    disabled={loading}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    <span className="text-xs">Generate Analysis</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
