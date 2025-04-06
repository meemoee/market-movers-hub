
import { useState, useEffect, useRef } from 'react'
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
  const renderCount = useRef(0)
  const contentLog = useRef<Array<{time: number, length: number, expanded: boolean, streaming: boolean}>>([])

  // Debug logs to track component lifecycle
  useEffect(() => {
    renderCount.current += 1;
    // console.log(`🔍 IterationCard #${iteration.iteration} RENDER #${renderCount.current}`, {
    //   isExpanded, isStreaming, isCurrentIteration, analysisLength: iteration.analysis?.length || 0
    // });
    
    // Log content state
    contentLog.current.push({
      time: Date.now(),
      length: iteration.analysis?.length || 0,
      expanded: isExpanded,
      streaming: isStreaming && isCurrentIteration
    });
    
    // Keep log at reasonable size
    if (contentLog.current.length > 20) {
      contentLog.current.shift();
    }
    
    return () => {
      // console.log(`🧹 IterationCard #${iteration.iteration} cleanup for render #${renderCount.current}`);
    };
  });
  
  // Log when analysis content changes - Removed
  // useEffect(() => {
  //   // console.log(`📝 IterationCard #${iteration.iteration} analysis update:
  //   //   Length: ${iteration.analysis?.length || 0}
  //   //   First 50 chars: "${iteration.analysis?.substring(0, 50) || ''}..."
  //   //   Last 50 chars: "...${iteration.analysis?.substring((iteration.analysis?.length || 0) - 50) || ''}"
  //   //   isStreaming: ${isStreaming}
  //   //   isCurrentIteration: ${isCurrentIteration}
  //   //   isExpanded: ${isExpanded}
  //   // `);
  // }, [iteration.analysis, iteration, isStreaming, isCurrentIteration, isExpanded]);
  
  // Log when expansion state changes - Removed
  // useEffect(() => {
  //   // console.log(`${isExpanded ? '📂 Expanded' : '📁 Collapsed'} IterationCard #${iteration.iteration}`);
  // }, [isExpanded, iteration.iteration]);
  
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    if (!isStreaming && isCurrentIteration && isExpanded && !isFinalIteration && iteration.analysis) {
      // Add a small delay to let the user see the completed results before collapsing
      // console.log(`⏱️ Setting up auto-collapse timer for iteration #${iteration.iteration}`);
      
      const timer = setTimeout(() => {
        // console.log(`⏱️ Auto-collapse triggered for iteration #${iteration.iteration}`);
        onToggleExpand();
      }, 1500);
      
      return () => {
        // console.log(`🧹 Clearing auto-collapse timer for iteration #${iteration.iteration}`);
        clearTimeout(timer);
      }
    }
  }, [isStreaming, isCurrentIteration, isExpanded, isFinalIteration, iteration.analysis, onToggleExpand, iteration.iteration]);

  // Track tab changes - Removed
  // useEffect(() => {
  //   // console.log(`📑 Tab changed to "${activeTab}" in iteration #${iteration.iteration}`);
  // }, [activeTab, iteration.iteration]);

  // Special debug for analysis tab visibility - Removed
  // useEffect(() => {
  //   if (isExpanded && activeTab === "analysis") {
  //     // console.log(`📊 Analysis tab ACTIVE in iteration #${iteration.iteration} - analysis length: ${iteration.analysis?.length || 0}`);
  //   }
  // }, [isExpanded, activeTab, iteration.iteration, iteration.analysis]);

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
        onClick={() => {
          // console.log(`🖱️ User clicked iteration #${iteration.iteration} header to ${isExpanded ? 'collapse' : 'expand'}`);
          onToggleExpand();
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Badge variant={isFinalIteration ? "default" : "outline"} 
            className={isStreaming && isCurrentIteration ? "animate-pulse bg-primary" : ""}>
            Iteration {iteration.iteration}
            {isStreaming && isCurrentIteration && " (Streaming...)"}
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
          <Tabs value={activeTab} onValueChange={(value) => {
            // console.log(`📑 Tab changing from "${activeTab}" to "${value}" in iteration #${iteration.iteration}`);
            setActiveTab(value);
          }} className="w-full max-w-full">
            <TabsList className="w-full grid grid-cols-3 mb-3">
              <TabsTrigger value="analysis" className="text-xs">Analysis</TabsTrigger>
              <TabsTrigger value="sources" className="text-xs">Sources ({iteration.results.length})</TabsTrigger>
              <TabsTrigger value="queries" className="text-xs">Queries ({iteration.queries.length})</TabsTrigger>
            </TabsList>
            
            <div className="tab-content-container h-[200px] w-full">
              <TabsContent value="analysis" className="w-full max-w-full h-full m-0 p-0">
                {/* Fix: Removed console.log statement here that was causing the error */}
                <AnalysisDisplay
                  content={iteration.analysis || "Analysis in progress..."}
                  isStreaming={isStreaming && isCurrentIteration}
                  maxHeight={200} // Pass fixed pixel height from parent container
                />
                {/* Fix: Removed console.log statement here that was causing the error */}
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
