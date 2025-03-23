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
    isAnalysisComplete?: boolean;
    isReasoningComplete?: boolean;
    isComplete?: boolean;
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming: boolean;
  isCurrentIteration: boolean;
  maxIterations: number;
}

export function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  isStreaming,
  isCurrentIteration,
  maxIterations
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  const isFinalIteration = iteration.iteration === maxIterations
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [streamingTimedOut, setStreamingTimedOut] = useState(false)
  
  // Reset timeout flag when streaming status changes
  useEffect(() => {
    if (isStreaming) {
      setStreamingTimedOut(false)
      setLastUpdateTime(Date.now())
    }
  }, [isStreaming])
  
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    // Check if the iteration is marked as complete explicitly
    const isIterationComplete = iteration.isComplete === true;
    
    if ((!isStreaming || isIterationComplete) && isCurrentIteration && isExpanded && !isFinalIteration && iteration.analysis) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        console.log('Auto-collapsing completed iteration:', iteration.iteration);
        onToggleExpand();
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isStreaming, iteration.isComplete, isCurrentIteration, isExpanded, isFinalIteration, iteration.analysis, onToggleExpand]);
  
  // Set a timeout detector - if streaming hasn't updated in 30 seconds, consider it complete
  useEffect(() => {
    if (isStreaming && isCurrentIteration) {
      const timeoutChecker = setInterval(() => {
        const now = Date.now();
        const elapsedTime = now - lastUpdateTime;
        
        // If streaming hasn't updated in 30 seconds, mark it as timed out
        if (elapsedTime > 30000 && !streamingTimedOut) {
          console.log('Stream timeout detected for iteration:', iteration.iteration);
          setStreamingTimedOut(true);
        }
      }, 5000); // Check every 5 seconds
      
      return () => clearInterval(timeoutChecker);
    }
    
    return undefined;
  }, [isStreaming, isCurrentIteration, lastUpdateTime, iteration.iteration, streamingTimedOut]);
  
  // Update the lastUpdateTime when analysis content changes
  useEffect(() => {
    if (isStreaming && isCurrentIteration) {
      setLastUpdateTime(Date.now());
    }
  }, [iteration.analysis, iteration.reasoning, isStreaming, isCurrentIteration]);

  // Determine streaming status based on individual properties, explicit completion flags, and timeout
  const isAnalysisStreaming = isStreaming && isCurrentIteration && 
                             (iteration.isAnalysisStreaming !== false) && 
                             (iteration.isAnalysisComplete !== true) &&
                             !streamingTimedOut && 
                             !iteration.isComplete;
                             
  const isReasoningStreaming = isStreaming && isCurrentIteration && 
                              (iteration.isReasoningStreaming !== false) && 
                              (iteration.isReasoningComplete !== true) &&
                              !streamingTimedOut && 
                              !iteration.isComplete;

  // Display streaming status text
  const getStatusText = () => {
    if (iteration.isComplete) {
      return "Complete";
    }
    
    if (streamingTimedOut) {
      return "Timed Out";
    }
    
    if (isStreaming && isCurrentIteration) {
      return "Streaming...";
    }
    
    return `${iteration.results.length} sources found`;
  };

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      isCurrentIteration && isStreaming && !streamingTimedOut && !iteration.isComplete ? "border-primary/40" : "border-border",
      streamingTimedOut ? "border-yellow-500/40" : "",
      iteration.isComplete ? "border-green-500/40" : ""
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
            className={isStreaming && isCurrentIteration && !streamingTimedOut && !iteration.isComplete ? "animate-pulse bg-primary" : 
                      streamingTimedOut ? "bg-yellow-600" :
                      iteration.isComplete ? "bg-green-600" : ""}>
            Iteration {iteration.iteration}
          </Badge>
          <span className="text-sm truncate">
            {isFinalIteration ? "Final Analysis" : getStatusText()}
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
                  isComplete={iteration.isComplete || iteration.isAnalysisComplete === true}
                  streamingTimedOut={streamingTimedOut}
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
                        {isStreaming && isCurrentIteration && !streamingTimedOut ? 
                          "Searching for sources..." : 
                          "No sources found for this iteration."}
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
                        {isStreaming && isCurrentIteration && !streamingTimedOut ? 
                          "Generating search queries..." : 
                          "No queries for this iteration."}
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
