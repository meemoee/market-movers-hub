
import { useState, useEffect, useRef } from 'react'
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, Search, AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { cn } from "@/lib/utils"
import { ResearchResult } from "./SitePreviewList"
import { toast } from '@/components/ui/use-toast'
import { getFaviconUrl } from "@/utils/favicon"

interface IterationCardProps {
  iteration: {
    iteration: number;
    queries: string[];
    results: ResearchResult[];
    analysis: string;
    analysis_complete?: string;
    analysis_error?: string;
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
  const timeoutRef = useRef<number | null>(null)
  
  // Debug logs to track component lifecycle
  useEffect(() => {
    renderCount.current += 1;
    
    // Clear previous timeout if it exists
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    
    // If we're showing "Analysis in progress..." and are streaming, set a timeout
    // to detect if the analysis is taking too long
    if (isStreaming && isCurrentIteration && 
        (!iteration.analysis || iteration.analysis === 'ANALYSIS_PROCESSING') && 
        !iteration.analysis_complete) {
      
      // After 45 seconds, if we're still showing "Analysis in progress...", 
      // switch to the sources tab and show a timeout warning
      timeoutRef.current = setTimeout(() => {
        setAnalysisTimeout(true);
        setActiveTab("sources");
        
        toast({
          title: "Analysis taking longer than expected",
          description: `Iteration ${iteration.iteration} analysis is taking longer than expected. We've switched to the sources tab so you can review the data.`,
          variant: "destructive",
        });
      }, 45000) as unknown as number; // 45 seconds
    }
    
    return () => {
      // Clean up timeout on unmount
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    }
  }, [iteration.analysis, isStreaming, isCurrentIteration, iteration.iteration, iteration.analysis_complete]);
  
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    if (!isStreaming && isCurrentIteration && isExpanded && !isFinalIteration && iteration.analysis && iteration.analysis_complete) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        onToggleExpand();
      }, 1500);
      
      return () => {
        clearTimeout(timer);
      }
    }
  }, [isStreaming, isCurrentIteration, isExpanded, isFinalIteration, iteration.analysis, onToggleExpand, iteration.iteration, iteration.analysis_complete]);

  // Helper function to determine what to show for analysis
  const getAnalysisContent = () => {
    if (iteration.analysis_error) {
      return `Error generating analysis: ${iteration.analysis_error}`;
    }
    
    if (!iteration.analysis || iteration.analysis === 'ANALYSIS_PROCESSING') {
      return "Analysis in progress...";
    }
    
    return iteration.analysis;
  };
  
  // Helper function to handle unexpected timeouts
  const handleAnalysisTimeout = () => {
    setActiveTab("sources");
    setAnalysisTimeout(true);
  };

  return (
    <div 
      className={cn(
        "iteration-card border rounded-md overflow-hidden w-full max-w-full",
        isCurrentIteration && isStreaming ? "border-primary/40" : "border-border"
      )}
      data-iteration={iteration.iteration}
      data-streaming={isStreaming && isCurrentIteration ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
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
            className={isStreaming && isCurrentIteration ? "animate-pulse bg-primary" : ""}>
            Iteration {iteration.iteration}
            {isStreaming && isCurrentIteration && " (Streaming...)"}
          </Badge>
          <span className="text-sm truncate">
            {isFinalIteration ? "Final Analysis" : `${iteration.results.length} sources found`}
            {analysisTimeout && !iteration.analysis_complete && (
              <span className="text-amber-500 ml-1">(Analysis delayed)</span>
            )}
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
              <TabsTrigger value="analysis" className="text-xs">
                Analysis
                {analysisTimeout && !iteration.analysis_complete && (
                  <AlertCircle className="h-3 w-3 text-amber-500 ml-1" />
                )}
              </TabsTrigger>
              <TabsTrigger value="sources" className="text-xs">Sources ({iteration.results.length})</TabsTrigger>
              <TabsTrigger value="queries" className="text-xs">Queries ({iteration.queries.length})</TabsTrigger>
            </TabsList>
            
            <div className="tab-content-container h-[200px] w-full">
              <TabsContent value="analysis" className="w-full max-w-full h-full m-0 p-0">
                <AnalysisDisplay
                  content={getAnalysisContent()}
                  isStreaming={isStreaming && isCurrentIteration && !iteration.analysis_complete}
                  maxHeight={200}
                />
                
                {analysisTimeout && !iteration.analysis_complete && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Analysis is taking longer than expected. You can check the sources tab to review the data that's being analyzed.
                    </p>
                  </div>
                )}
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
