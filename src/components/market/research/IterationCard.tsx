
import { useState, useEffect, useRef } from 'react'
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, Search } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { cn } from "@/lib/utils"
import { ResearchResult } from "./SitePreviewList"
import { getFaviconUrl } from "@/utils/favicon"
import { toast } from '@/components/ui/use-toast'

interface IterationCardProps {
  iteration: {
    iteration: number;
    queries: string[];
    results: ResearchResult[];
    analysis: string;
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
  const [analysisTimeout, setAnalysisTimeout] = useState<boolean>(false)
  const isFinalIteration = iteration.iteration === maxIterations
  const renderCount = useRef(0)
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Debug logs to track component lifecycle
  useEffect(() => {
    renderCount.current += 1;
    console.log(`IterationCard ${iteration.iteration} rendered ${renderCount.current} times, isStreaming: ${isStreaming}, isCurrentIteration: ${isCurrentIteration}, analysis length: ${iteration.analysis?.length || 0}`);
  });
  
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    if (!isStreaming && isCurrentIteration && isExpanded && !isFinalIteration && iteration.analysis) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        onToggleExpand();
      }, 1500);
      
      return () => {
        clearTimeout(timer);
      }
    }
  }, [isStreaming, isCurrentIteration, isExpanded, isFinalIteration, iteration.analysis, onToggleExpand, iteration.iteration]);

  // Set up timeout for analysis state
  useEffect(() => {
    // If we're on the current iteration, streaming, and analysis tab is active
    if (isCurrentIteration && isStreaming && activeTab === "analysis") {
      // Clear any existing timeout
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
      
      // Set a new timeout to detect if analysis is stuck
      analysisTimeoutRef.current = setTimeout(() => {
        console.log(`Analysis timeout triggered for iteration ${iteration.iteration}`);
        setAnalysisTimeout(true);
        
        // Auto-switch to sources tab if analysis seems stuck
        if (iteration.results && iteration.results.length > 0) {
          setActiveTab("sources");
          toast({
            title: "Analysis in progress",
            description: `Showing sources while analysis for iteration ${iteration.iteration} completes`,
            duration: 5000,
          });
        }
      }, 10000); // 10 seconds timeout
    }
    
    // Reset timeout state when iteration changes or stops streaming
    if (!isStreaming || !isCurrentIteration) {
      setAnalysisTimeout(false);
    }
    
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
    }
  }, [isCurrentIteration, isStreaming, activeTab, iteration.iteration, iteration.results]);

  const getAnalysisContent = () => {
    if (iteration.analysis) {
      return iteration.analysis;
    }
    
    if (isCurrentIteration && isStreaming) {
      if (analysisTimeout) {
        return "Analysis taking longer than expected. You can check the sources tab meanwhile...";
      }
      return "Analysis in progress...";
    }
    
    return "No analysis available.";
  };

  return (
    <div 
      className={cn(
        "iteration-card border rounded-md overflow-hidden w-full max-w-full",
        isCurrentIteration && isStreaming ? "border-primary/40" : "border-border",
        analysisTimeout && isCurrentIteration && isStreaming ? "border-yellow-400/60" : ""
      )}
      data-iteration={iteration.iteration}
      data-streaming={isStreaming && isCurrentIteration ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
      data-timeout={analysisTimeout ? "true" : "false"}
    >
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
            className={cn(
              isStreaming && isCurrentIteration ? "animate-pulse bg-primary" : "",
              analysisTimeout && isCurrentIteration && isStreaming ? "bg-yellow-400" : ""
            )}>
            Iteration {iteration.iteration}
            {isStreaming && isCurrentIteration && " (Streaming...)"}
          </Badge>
          <span className="text-sm truncate">
            {isFinalIteration ? "Final Analysis" : `${iteration.results.length} sources found`}
          </span>
          
          {analysisTimeout && isCurrentIteration && isStreaming && (
            <span className="text-xs text-yellow-500">Taking longer than expected</span>
          )}
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
                  content={getAnalysisContent()}
                  isStreaming={isStreaming && isCurrentIteration && !analysisTimeout}
                  maxHeight={200}
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
