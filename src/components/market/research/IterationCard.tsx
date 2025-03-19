
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
    job_id?: string; // Added job_id for realtime streaming
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming: boolean;
  isCurrentIteration: boolean;
  maxIterations: number;
  jobId?: string; // Add jobId prop
}

export function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  isStreaming,
  isCurrentIteration,
  maxIterations,
  jobId  // Accept jobId from parent component
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  const isFinalIteration = iteration.iteration === maxIterations
  
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

  // Use the job_id from the iteration if available, otherwise fall back to the jobId prop
  const effectiveJobId = iteration.job_id || jobId;

  return (
    <div className={cn(
      "iteration-card border rounded-md overflow-hidden w-full max-w-full",
      isExpanded ? "mb-4" : "",
      isCurrentIteration && isStreaming ? "border-blue-500 bg-blue-500/10" : "",
      !isExpanded && iteration.analysis ? "bg-gray-900/30" : ""
    )}>
      <div 
        className="flex justify-between items-center p-3 cursor-pointer hover:bg-accent/20"
        onClick={onToggleExpand}
      >
        <div className="flex items-center space-x-2">
          <div className="flex flex-col items-start">
            <div className="flex items-center">
              <span className="font-medium">
                {isCurrentIteration && isStreaming ? (
                  <Badge variant="outline" className="flex items-center gap-1 py-1 animate-pulse bg-blue-500/20">
                    <span>Processing Iteration {iteration.iteration}</span>
                  </Badge>
                ) : (
                  <span>Iteration {iteration.iteration}</span>
                )}
              </span>
              
              {iteration.analysis && (
                <Badge variant="outline" className="ml-2 bg-green-500/20">
                  Complete
                </Badge>
              )}
              
              {isCurrentIteration && !iteration.analysis && !isStreaming && (
                <Badge variant="outline" className="ml-2 bg-amber-500/20">
                  Pending
                </Badge>
              )}
            </div>
            
            {iteration.queries && iteration.queries.length > 0 && (
              <span className="text-xs text-muted-foreground mt-1">
                {iteration.queries.length} search queries generated
              </span>
            )}
          </div>
        </div>
        <div>
          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3">
          <Tabs defaultValue="analysis" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-2">
              <TabsTrigger value="analysis" className="flex items-center">
                <FileText className="h-4 w-4 mr-1" />
                Analysis
              </TabsTrigger>
              <TabsTrigger value="queries" className="flex items-center">
                <Search className="h-4 w-4 mr-1" />
                Queries
              </TabsTrigger>
              {iteration.results && iteration.results.length > 0 && (
                <TabsTrigger value="sources" className="flex items-center">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Sources ({iteration.results.length})
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="analysis" className="mt-0">
              {(iteration.analysis || isStreaming) && (
                <AnalysisDisplay 
                  content={iteration.analysis || ''} 
                  isStreaming={isStreaming && isCurrentIteration} 
                  jobId={effectiveJobId}
                  iteration={iteration.iteration}
                />
              )}
              
              {!iteration.analysis && !isStreaming && (
                <div className="text-sm text-muted-foreground p-2 rounded border border-border bg-accent/20">
                  Analysis will be available once this iteration completes
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="queries" className="mt-0">
              {iteration.queries && iteration.queries.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border p-2">
                  <div className="space-y-2">
                    {iteration.queries.map((query, idx) => (
                      <div key={idx} className="text-sm p-2 rounded bg-accent/20">
                        {query}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-sm text-muted-foreground p-2 rounded border border-border bg-accent/20">
                  No queries generated yet
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="sources" className="mt-0">
              {iteration.results && iteration.results.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border p-2">
                  <div className="space-y-2">
                    {iteration.results.map((result, idx) => (
                      <div key={idx} className="text-sm p-2 rounded bg-accent/20 flex items-start gap-2">
                        {result.url && (
                          <img 
                            src={getFaviconUrl(result.url)} 
                            className="w-4 h-4 mt-1 flex-shrink-0" 
                            alt=""
                            onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                          />
                        )}
                        <div>
                          <div className="font-medium">{result.title || 'Untitled Source'}</div>
                          {result.url && (
                            <a 
                              href={result.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                            >
                              {result.url.split('/')[2]}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-sm text-muted-foreground p-2 rounded border border-border bg-accent/20">
                  No sources retrieved yet
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
