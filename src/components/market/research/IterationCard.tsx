
import { useState } from 'react'
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, FileText, Search, ExternalLink } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { cn } from "@/lib/utils"

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

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
            <TabsList className="w-full grid grid-cols-3 mb-3 bg-secondary/80">
              <TabsTrigger 
                value="analysis" 
                className="text-xs text-secondary-foreground bg-transparent 
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=inactive]:bg-secondary/80 data-[state=inactive]:text-secondary-foreground"
              >
                Analysis
              </TabsTrigger>
              <TabsTrigger 
                value="sources" 
                className="text-xs text-secondary-foreground bg-transparent
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=inactive]:bg-secondary/80 data-[state=inactive]:text-secondary-foreground"
              >
                Sources ({iteration.results.length})
              </TabsTrigger>
              <TabsTrigger 
                value="queries" 
                className="text-xs text-secondary-foreground bg-transparent
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=inactive]:bg-secondary/80 data-[state=inactive]:text-secondary-foreground"
              >
                Queries ({iteration.queries.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="analysis" className="w-full max-w-full">
              <AnalysisDisplay 
                content={iteration.analysis || "Analysis in progress..."} 
                isStreaming={isStreaming && isCurrentIteration}
                maxHeight={isFinalIteration ? "300px" : "200px"}
              />
            </TabsContent>
            
            <TabsContent value="sources" className="w-full max-w-full">
              <ScrollArea className="h-[200px] rounded-md border p-3 w-full max-w-full">
                <div className="space-y-2 w-full">
                  {iteration.results.map((result, idx) => (
                    <div key={idx} className="source-item bg-accent/5 hover:bg-accent/10 p-2 rounded-md w-full max-w-full">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 flex-shrink-0" />
                        <span className="source-title text-sm font-medium">
                          {result.title || new URL(result.url).hostname}
                        </span>
                      </div>
                      <a 
                        href={result.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="source-url flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{result.url}</span>
                      </a>
                      {result.content && (
                        <div className="source-content text-xs text-muted-foreground mt-2">
                          {result.content.substring(0, 120)}...
                        </div>
                      )}
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
            
            <TabsContent value="queries" className="w-full max-w-full overflow-x-hidden">
              <ScrollArea className="h-[150px] rounded-md border p-3 w-full">
                <div className="flex flex-wrap gap-2 w-full">
                  {iteration.queries.map((query, idx) => (
                    <div key={idx} className="query-badge bg-accent/10 flex items-center gap-1 p-1.5 rounded-md w-fit max-w-full">
                      <Search className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate text-xs max-w-[280px] sm:max-w-[360px] md:max-w-[400px]">{query}</span>
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
          </Tabs>
        </div>
      )}
    </div>
  );
}
