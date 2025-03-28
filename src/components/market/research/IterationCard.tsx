
import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, FileText, Search, ExternalLink } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { cn } from "@/lib/utils"
import { ResearchResult } from "./SitePreviewList"
import { getFaviconUrl } from "@/utils/favicon"

interface IterationCardProps {
  iteration: {
    iteration: number;
    queries: string[];
    results: ResearchResult[];
    analysis: string;
    reasoning?: string;
    isAnalysisStreaming?: boolean;
    isReasoningStreaming?: boolean;
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming: boolean;
  isCurrentIteration: boolean;
  maxIterations: number;
  onStreamEnd?: () => void;
}

export function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  isStreaming,
  isCurrentIteration,
  maxIterations,
  onStreamEnd
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  const isFinalIteration = iteration.iteration === maxIterations
  const [analysisStreamTimeout, setAnalysisStreamTimeout] = useState<NodeJS.Timeout | null>(null)
  const [reasoningStreamTimeout, setReasoningStreamTimeout] = useState<NodeJS.Timeout | null>(null)
  
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    if (!isStreaming && isCurrentIteration && isExpanded && !isFinalIteration && iteration.analysis) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        onToggleExpand();
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isCurrentIteration, isExpanded, isFinalIteration, iteration.analysis, onToggleExpand]);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (analysisStreamTimeout) clearTimeout(analysisStreamTimeout);
      if (reasoningStreamTimeout) clearTimeout(reasoningStreamTimeout);
    };
  }, [analysisStreamTimeout, reasoningStreamTimeout]);

  // Set a failsafe timeout for streaming status to prevent UI getting stuck
  useEffect(() => {
    if (iteration.isAnalysisStreaming) {
      // Clear any existing timeout
      if (analysisStreamTimeout) clearTimeout(analysisStreamTimeout);
      
      // Set a new timeout (5 minutes max for analysis streaming)
      const timeout = setTimeout(() => {
        console.log(`Analysis stream timeout reached for iteration ${iteration.iteration}`);
        iteration.isAnalysisStreaming = false;
      }, 5 * 60 * 1000);
      
      setAnalysisStreamTimeout(timeout);
    } else if (analysisStreamTimeout) {
      clearTimeout(analysisStreamTimeout);
      setAnalysisStreamTimeout(null);
    }
  }, [iteration.isAnalysisStreaming, iteration.iteration]);

  // Same failsafe for reasoning streaming
  useEffect(() => {
    if (iteration.isReasoningStreaming) {
      // Clear any existing timeout
      if (reasoningStreamTimeout) clearTimeout(reasoningStreamTimeout);
      
      // Set a new timeout (5 minutes max for reasoning streaming)
      const timeout = setTimeout(() => {
        console.log(`Reasoning stream timeout reached for iteration ${iteration.iteration}`);
        iteration.isReasoningStreaming = false;
      }, 5 * 60 * 1000);
      
      setReasoningStreamTimeout(timeout);
    } else if (reasoningStreamTimeout) {
      clearTimeout(reasoningStreamTimeout);
      setReasoningStreamTimeout(null);
    }
  }, [iteration.isReasoningStreaming, iteration.iteration]);

  // Determine streaming state with more reliable indicators
  const isAnalysisStreaming = isStreaming && isCurrentIteration && iteration.isAnalysisStreaming === true;
  const isReasoningStreaming = isStreaming && isCurrentIteration && iteration.isReasoningStreaming === true;
  const isAnyStreaming = isAnalysisStreaming || isReasoningStreaming;

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      isCurrentIteration && isAnyStreaming ? "border-primary/40" : "border-border"
    )}>
      <div 
        className={cn(
          "iteration-card-header flex items-center justify-between p-3 w-full",
          isExpanded ? "bg-accent/10" : "",
          "hover:bg-accent/10 cursor-pointer"
        )}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Badge variant={isFinalIteration ? "default" : "outline"} 
            className={isAnyStreaming ? "animate-pulse bg-primary" : ""}>
            Iteration {iteration.iteration}
            {isAnyStreaming && " (Streaming...)"}
          </Badge>
          <span className="text-sm truncate">
            {isFinalIteration ? "Final Analysis" : `${iteration.results.length} sources found`}
          </span>
        </div>
        {isExpanded ? 
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : 
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
      </div>
      
      {isExpanded && (
        <div className="p-3 w-full max-w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-full">
            <TabsList className="w-full grid grid-cols-3 mb-3">
              <TabsTrigger value="analysis" className="text-xs">Analysis</TabsTrigger>
              <TabsTrigger value="sources" className="text-xs">Sources ({iteration.results.length})</TabsTrigger>
              <TabsTrigger value="queries" className="text-xs">Queries ({iteration.queries.length})</TabsTrigger>
            </TabsList>
            
            <div className="tab-content-container h-[200px] w-full">
              <TabsContent value="analysis" className="w-full max-w-full h-full m-0 p-0">
                <AnalysisDisplay 
                  content={iteration.analysis || "Analysis in progress..."} 
                  reasoning={iteration.reasoning}
                  isStreaming={isAnalysisStreaming}
                  isReasoningStreaming={isReasoningStreaming}
                  maxHeight="100%"
                  onStreamEnd={onStreamEnd}
                />
              </TabsContent>
              
              <TabsContent value="sources" className="w-full max-w-full h-full m-0 p-0">
                <ScrollArea className="h-full rounded-md border p-3 w-full max-w-full">
                  <div className="space-y-2 w-full">
                    {iteration.results.map((result, idx) => (
                      <div key={idx} className="source-item bg-accent/5 hover:bg-accent/10 w-full max-w-full p-2 rounded-md">
                        <div className="flex items-center gap-2">
                          <img 
                            src={getFaviconUrl(result.url)} 
                            alt=""
                            className="w-4 h-4 flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(
                                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
                              )}`;
                            }}
                          />
                          <a 
                            href={result.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline truncate w-full"
                            title={result.url}
                          >
                            {result.url}
                          </a>
                        </div>
                      </div>
                    ))}
                    
                    {iteration.results.length === 0 && (
                      <div className="p-4 text-center text-muted-foreground">
                        No sources found for this iteration.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="queries" className="w-full max-w-full h-full m-0 p-0">
                <ScrollArea className="h-full rounded-md border p-3 w-full">
                  <div className="space-y-2 w-full">
                    {iteration.queries.map((query, idx) => (
                      <div key={idx} className="query-badge bg-accent/10 p-2 rounded-md flex items-center gap-1 w-full mb-2">
                        <Search className="h-3 w-3 flex-shrink-0 mr-1" />
                        <span className="text-xs break-words">{query}</span>
                      </div>
                    ))}
                    
                    {iteration.queries.length === 0 && (
                      <div className="p-4 text-center text-muted-foreground">
                        No queries for this iteration.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
