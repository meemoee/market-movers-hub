
<<<<<<< HEAD
import { useState, useEffect } from 'react' // Removed useRef
=======
import { useState, useEffect } from 'react'
>>>>>>> 15af2e2916ab4c1bcf7f91379ead3238ca8d4186
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, Search } from "lucide-react" // Removed FileText, ExternalLink (not used)
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { cn } from "@/lib/utils"
import { ResearchResult } from "./SitePreviewList"
import { getFaviconUrl } from "@/utils/favicon"
<<<<<<< HEAD
// Removed supabase import (not used)

export type AnalysisStreamingStatus = 'idle' | 'streaming' | 'done' | 'error'; // Added export
=======
>>>>>>> 15af2e2916ab4c1bcf7f91379ead3238ca8d4186

interface IterationCardProps {
  iteration: {
    iteration: number;
    queries: string[];
    results: ResearchResult[];
    analysis: string; // Keep this for potentially pre-loaded analysis
    reasoning?: string; // Keep this for potentially pre-loaded reasoning
    // Removed isAnalysisStreaming, isReasoningStreaming flags
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  // isStreaming prop might be repurposed or removed depending on parent logic
  isCurrentIteration: boolean; // Still needed to know if this is the active iteration
  maxIterations: number;
<<<<<<< HEAD
  jobId?: string; // Keep jobId if needed for other purposes, otherwise remove
  currentAnalysisText: string; // New prop for the streaming/final text
  analysisStreamingStatus: AnalysisStreamingStatus; // New prop for status
=======
>>>>>>> 15af2e2916ab4c1bcf7f91379ead3238ca8d4186
}

export function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  // isStreaming, // Prop might be removed or repurposed
  isCurrentIteration,
<<<<<<< HEAD
  maxIterations,
  // jobId, // Prop might be removed
  currentAnalysisText,
  analysisStreamingStatus
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  // Removed streamingAnalysis and streamingReasoning local state
  // Removed webSocketRef
  const isFinalIteration = iteration.iteration === maxIterations

  // Removed WebSocket useEffect hook

=======
  maxIterations
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  const isFinalIteration = iteration.iteration === maxIterations
  
>>>>>>> 15af2e2916ab4c1bcf7f91379ead3238ca8d4186
  // Auto-collapse when iteration completes and it's not the final iteration
  useEffect(() => {
    // Use analysisStreamingStatus to determine completion
    if (analysisStreamingStatus === 'done' && isCurrentIteration && isExpanded && !isFinalIteration) {
      // Add a small delay to let the user see the completed results before collapsing
      const timer = setTimeout(() => {
        onToggleExpand();
      }, 1500);

      return () => clearTimeout(timer);
    }
    // Depend on analysisStreamingStatus instead of isStreaming and iteration.analysis
  }, [analysisStreamingStatus, isCurrentIteration, isExpanded, isFinalIteration, onToggleExpand]);

  // Determine streaming status based on the new prop
  const isCurrentlyStreaming = analysisStreamingStatus === 'streaming';
  // Reasoning streaming is not handled in this simplified approach
  const isReasoningStreaming = false;

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      // Update border/styling based on analysisStreamingStatus if desired
      isCurrentIteration && isCurrentlyStreaming ? "border-primary/40" : "border-border"
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
                 className={isCurrentlyStreaming ? "animate-pulse bg-primary" : ""}>
            Iteration {iteration.iteration}
            {isCurrentlyStreaming && " (Streaming...)"}
            {analysisStreamingStatus === 'error' && " (Error)"}
          </Badge>
          <span className="text-sm truncate">
            {isFinalIteration ? "Final Analysis Prep" : `${iteration.results.length} sources found`}
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
<<<<<<< HEAD
                <AnalysisDisplay
                  // Use the prop for content. Provide fallback text.
                  content={currentAnalysisText || (isCurrentlyStreaming ? "Receiving analysis..." : iteration.analysis || "Analysis pending...")}
                  // Reasoning is not streamed in this simplified approach
                  reasoning={iteration.reasoning}
                  isStreaming={isCurrentlyStreaming}
                  isReasoningStreaming={false} // Reasoning not streamed
=======
                <AnalysisDisplay 
                  content={iteration.analysis || "Analysis in progress..."} 
                  reasoning={iteration.reasoning}
                  isStreaming={isAnalysisStreaming}
                  isReasoningStreaming={isReasoningStreaming}
>>>>>>> 15af2e2916ab4c1bcf7f91379ead3238ca8d4186
                  maxHeight="100%"
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
