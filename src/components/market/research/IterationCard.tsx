
import { useState } from 'react'
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ResearchResult } from "./SitePreviewList"
import { IterationAnalysisTab } from "./IterationAnalysisTab"
import { IterationSourcesTab } from "./IterationSourcesTab"
import { IterationQueriesTab } from "./IterationQueriesTab"
import { useAutoCollapse } from "./useAutoCollapse"
import { useStreamTrigger } from "./useStreamTrigger"

interface IterationCardProps {
  iteration: {
    iteration: number;
    queries: string[];
    results: ResearchResult[];
    analysis: string;
    reasoning?: string;
    isAnalysisStreaming?: boolean;
    isReasoningStreaming?: boolean;
    streamStatus?: 'waiting' | 'streaming' | 'complete';
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming: boolean;
  isCurrentIteration: boolean;
  maxIterations: number;
  onStartStream?: (iterationNumber: number) => void;
}

export function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  isStreaming,
  isCurrentIteration,
  maxIterations,
  onStartStream
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  const isFinalIteration = iteration.iteration === maxIterations
  
  // Ensure queries and results exist with fallbacks to empty arrays
  const queries = iteration.queries || [];
  const results = iteration.results || [];
  const analysis = iteration.analysis || '';
  const reasoning = iteration.reasoning || '';
  
  // Use the custom hook for auto-collapse functionality
  useAutoCollapse({
    isStreaming,
    isCurrentIteration,
    isExpanded,
    isFinalIteration,
    analysis,
    onToggleExpand
  });

  // Use the custom hook for stream trigger functionality
  useStreamTrigger({
    isCurrentIteration,
    isStreaming,
    iteration,
    onStartStream
  });

  // Determine streaming status based on individual properties
  const isAnalysisStreaming = isStreaming && isCurrentIteration && (iteration.isAnalysisStreaming !== false);
  const isReasoningStreaming = isStreaming && isCurrentIteration && (iteration.isReasoningStreaming !== false);

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      isCurrentIteration && isStreaming ? "border-primary/40" : "border-border"
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
            className={isStreaming && isCurrentIteration ? "animate-pulse bg-primary" : ""}>
            Iteration {iteration.iteration}
            {isStreaming && isCurrentIteration && " (Streaming...)"}
          </Badge>
          <span className="text-sm truncate">
            {isFinalIteration ? "Final Analysis" : `${results.length} sources found`}
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
              <TabsTrigger value="sources" className="text-xs">Sources ({results.length})</TabsTrigger>
              <TabsTrigger value="queries" className="text-xs">Queries ({queries.length})</TabsTrigger>
            </TabsList>
            
            <div className="tab-content-container h-[200px] w-full">
              <TabsContent value="analysis" className="w-full max-w-full h-full m-0 p-0">
                <IterationAnalysisTab 
                  analysis={analysis} 
                  reasoning={reasoning}
                  isAnalysisStreaming={isAnalysisStreaming}
                  isReasoningStreaming={isReasoningStreaming}
                />
              </TabsContent>
              
              <TabsContent value="sources" className="w-full max-w-full h-full m-0 p-0">
                <IterationSourcesTab results={results} />
              </TabsContent>
              
              <TabsContent value="queries" className="w-full max-w-full h-full m-0 p-0">
                <IterationQueriesTab queries={queries} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
