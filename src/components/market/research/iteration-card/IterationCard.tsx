
import { useState } from 'react'
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ResearchResult } from "../../JobQueueResearchCard"
import { AnalysisDisplay } from "../AnalysisDisplay"
import { SourcesTabContent } from "./SourcesTabContent"
import { QueriesTabContent } from "./QueriesTabContent"
import { useAutoCollapse } from "./useAutoCollapse"

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
  isCurrentIteration: boolean;
  isFinalIteration: boolean;
  maxIterations: number;
  onStartStream?: (iterationNumber: number) => void;
}

export function IterationCard({
  iteration,
  isCurrentIteration,
  isFinalIteration,
  maxIterations,
  onStartStream
}: IterationCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("analysis");
  
  const onToggleExpand = () => setIsExpanded(prev => !prev);

  // Use the custom hook for auto-collapse behavior
  useAutoCollapse(
    // Is streaming
    !!(isCurrentIteration && iteration.isAnalysisStreaming),
    // Is current iteration
    isCurrentIteration,
    // Is expanded
    isExpanded,
    // Is final iteration
    isFinalIteration,
    // Has analysis
    !!iteration.analysis,
    // Toggle expand callback
    onToggleExpand
  );

  // Determine streaming status based on individual properties
  const isAnalysisStreaming = isCurrentIteration && (iteration.isAnalysisStreaming !== false);
  const isReasoningStreaming = isCurrentIteration && (iteration.isReasoningStreaming !== false);

  // Trigger direct streaming if needed and available
  useEffect(() => {
    if (isCurrentIteration && onStartStream && 
        iteration.streamStatus === 'waiting' && iteration.results && iteration.results.length > 0) {
      onStartStream(iteration.iteration);
    }
  }, [isCurrentIteration, iteration, onStartStream]);

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      isCurrentIteration && isAnalysisStreaming ? "border-primary/40" : "border-border"
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
            className={isAnalysisStreaming ? "animate-pulse bg-primary" : ""}>
            Iteration {iteration.iteration}
            {isAnalysisStreaming && " (Streaming...)"}
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
                />
              </TabsContent>
              
              <TabsContent value="sources" className="w-full max-w-full h-full m-0 p-0">
                <SourcesTabContent results={iteration.results} />
              </TabsContent>
              
              <TabsContent value="queries" className="w-full max-w-full h-full m-0 p-0">
                <QueriesTabContent queries={iteration.queries} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// Add the missing useEffect import
import { useEffect } from 'react';
