
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnalysisDisplay } from "./AnalysisDisplay"

interface IterationCardProps {
  iteration: {
    iteration: number;
    queries: string[];
    results: any[];
    analysis?: string;
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming?: boolean;
  isCurrentIteration?: boolean;
  maxIterations: number;
  analysisContent?: string; // New prop for streaming analysis content
}

export function IterationCard({ 
  iteration, 
  isExpanded, 
  onToggleExpand, 
  isStreaming = false,
  isCurrentIteration = false,
  maxIterations,
  analysisContent // Use this instead of iteration.analysis when provided
}: IterationCardProps) {
  const [activeTab, setActiveTab] = useState<'queries' | 'analysis'>('analysis')
  
  const hasAnalysisContent = analysisContent || iteration.analysis
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <CollapsibleTrigger asChild onClick={onToggleExpand}>
          <div className="flex justify-between items-center cursor-pointer">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                Iteration {iteration.iteration}
                {isStreaming && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex gap-1 items-center">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Processing</span>
                  </Badge>
                )}
                {isCurrentIteration && iteration.iteration === maxIterations && !isStreaming && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Final
                  </Badge>
                )}
              </CardTitle>
              
              <div className="flex gap-1.5">
                <div className="text-xs text-muted-foreground">
                  {iteration.queries.length} queries
                </div>
                <div className="text-xs text-muted-foreground">•</div>
                <div className="text-xs text-muted-foreground">
                  {iteration.results?.length || 0} results
                </div>
              </div>
            </div>
            
            <div className="flex items-center">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
      </CardHeader>
      
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0 px-0">
            <div className="flex border-b px-4">
              <Button 
                variant={activeTab === 'analysis' ? "default" : "ghost"} 
                size="sm"
                onClick={() => setActiveTab('analysis')}
                className="rounded-none border-b-2 border-b-transparent transition-none"
                style={{ 
                  borderBottomColor: activeTab === 'analysis' ? 'var(--primary)' : 'transparent',
                  marginBottom: "-1px"
                }}
              >
                Analysis
              </Button>
              <Button 
                variant={activeTab === 'queries' ? "default" : "ghost"} 
                size="sm"
                onClick={() => setActiveTab('queries')}
                className="rounded-none border-b-2 border-b-transparent transition-none"
                style={{ 
                  borderBottomColor: activeTab === 'queries' ? 'var(--primary)' : 'transparent',
                  marginBottom: "-1px"
                }}
              >
                Search Queries
              </Button>
            </div>
            
            <div className="px-4 py-3">
              {activeTab === 'analysis' ? (
                hasAnalysisContent ? (
                  <AnalysisDisplay 
                    content={analysisContent || iteration.analysis || ""} 
                    isStreaming={isStreaming}
                    maxHeight="300px"
                  />
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    {isStreaming ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Analysis in progress...</span>
                      </div>
                    ) : (
                      "No analysis available for this iteration."
                    )}
                  </div>
                )
              ) : (
                <ScrollArea className="border rounded-md p-3 max-h-[300px]">
                  <div className="space-y-2">
                    {iteration.queries.map((query, idx) => (
                      <div key={idx} className="px-3 py-2 bg-accent/10 rounded text-sm">
                        {query}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
