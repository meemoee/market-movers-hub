
import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResearchResult } from "./SitePreviewList";
import { SitePreviewList } from "./SitePreviewList";
import { AnalysisDisplay } from "./AnalysisDisplay";
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [previousAnalysis, setPreviousAnalysis] = useState('');
  
  // Monitor changes in analysis to detect when streaming is complete
  useEffect(() => {
    // If this isn't the current iteration being processed, skip
    if (!isCurrentIteration) return;
    
    // If the analysis hasn't changed in a while, it's likely complete
    if (iteration.analysis && iteration.analysis.length > 0) {
      if (previousAnalysis === iteration.analysis) {
        if (!analysisComplete) {
          setAnalysisComplete(true);
          
          // Auto-collapse this iteration after a delay, unless it's the final iteration
          const isFinalIteration = iteration.iteration === maxIterations;
          if (!isFinalIteration) {
            const timer = setTimeout(() => {
              onToggleExpand();
            }, 1500); // 1.5 second delay before collapsing
            
            return () => clearTimeout(timer);
          }
        }
      } else {
        // Analysis is still being updated
        setPreviousAnalysis(iteration.analysis);
        setAnalysisComplete(false);
      }
    }
  }, [iteration.analysis, previousAnalysis, isCurrentIteration, analysisComplete, onToggleExpand, iteration.iteration, maxIterations]);
  
  return (
    <Card className={`border-l-4 ${isCurrentIteration && isStreaming ? 'border-l-primary' : 'border-l-muted'} overflow-hidden`}>
      <div 
        className={`flex items-center justify-between p-3 cursor-pointer hover:bg-accent/20 ${isExpanded ? 'bg-accent/10' : ''}`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <h3 className="text-sm font-medium">
            Iteration {iteration.iteration} 
            {isCurrentIteration && isStreaming && <span className="ml-2 text-primary animate-pulse">processing...</span>}
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {iteration.queries.length} queries • {iteration.results.length} results
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 border-t space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Search Queries:</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {iteration.queries.map((query, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-xs bg-accent/30 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">{index + 1}</span>
                  <span>{query}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {iteration.results.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Results:</h4>
              <SitePreviewList results={iteration.results} />
            </div>
          )}
          
          {iteration.analysis && (
            <div>
              <h4 className="text-sm font-medium mb-2">Analysis:</h4>
              <AnalysisDisplay content={iteration.analysis} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
