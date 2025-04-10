import { useState, useEffect } from 'react'; // Import useEffect
import { ResearchJob, MarketContextData, InsightsDisplayData, ResearchIteration, FinalResearchResults, ResearchResult } from '@/types/research'; // Import ResearchResult
import { ProgressDisplay } from "./ProgressDisplay";
import { IterationCard } from "./IterationCard";
import { InsightsDisplay } from "./InsightsDisplay";
import { SitePreviewList } from "./SitePreviewList";
import { AnalysisDisplay } from "./AnalysisDisplay";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";

interface CurrentJobDisplayProps {
  jobId: string | null;
  jobStatus: ResearchJob['status'] | null;
  progressLog: string[];
  progressPercent: number;
  iterations: ResearchIteration[];
  finalResults: FinalResearchResults | null;
  processedInsights: InsightsDisplayData | null;
  error: string | null;
  isLoading: boolean; // Loading state from useResearchJobState
  currentJobData: ResearchJob | null; // Full job data for static info like focus_text
  marketData: MarketContextData; // For InsightsDisplay calculations
  onResearchArea: (area: string) => void; // Callback for starting new focused research
}

// Utility function to get status badge (consider moving to utils file)
const renderStatusBadge = (status: ResearchJob['status'] | null) => {
    if (!status) return null;
    switch (status) {
      case 'queued':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3" />
            <span>Queued</span>
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing</span>
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3" />
            <span>Completed</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </Badge>
        );
      default:
        return null;
    }
  };


export function CurrentJobDisplay({
  jobId,
  jobStatus,
  progressLog,
  progressPercent,
  iterations,
  finalResults,
  processedInsights,
  error,
  isLoading,
  currentJobData,
  marketData,
  onResearchArea,
}: CurrentJobDisplayProps) {
  const [expandedIterations, setExpandedIterations] = useState<number[]>([]);

  // Auto-expand latest iteration when it appears
  useEffect(() => { // Changed useState to useEffect
    if (iterations.length > 0) {
      const latestIterationNum = Math.max(...iterations.map(i => i.iteration));
      if (!expandedIterations.includes(latestIterationNum)) {
        setExpandedIterations(prev => [...prev, latestIterationNum]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iterations]); // Dependency on iterations array

  const toggleIterationExpand = (iterationNum: number) => {
    setExpandedIterations(prev =>
      prev.includes(iterationNum)
        ? prev.filter(i => i !== iterationNum)
        : [...prev, iterationNum]
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2">Loading job data...</span>
      </div>
    );
  }

  // If not loading but no job ID, it means either no job selected or reset state
  if (!jobId) {
     return <div className="text-center text-muted-foreground p-4">No research job selected or active.</div>;
  }

  const focusText = currentJobData?.focus_text;
  const searchResults = finalResults?.data ?? [];
  const finalAnalysis = finalResults?.analysis;
  const maxIterationsFromJob = currentJobData?.max_iterations ?? 3; // Default if not available

  return (
    <div className="space-y-4 w-full">
       {/* Display Status Badge (moved from header in original) */}
       <div className="flex items-center gap-2">
         <span className="text-sm font-medium">Status:</span>
         {renderStatusBadge(jobStatus)}
       </div>

      {/* Display Focus Text */}
      {focusText && (
        <div className="bg-accent/10 px-3 py-2 rounded-md text-sm">
          <span className="font-medium">Research focus:</span> {focusText}
        </div>
      )}

      {/* Display Error */}
      {error && !error.startsWith("Job failed:") && ( // Avoid duplicating failure message if shown in progress
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-3 rounded w-full">
          {error}
        </div>
      )}

      {/* Progress Display */}
      <ProgressDisplay
        messages={progressLog}
        jobId={jobId}
        progress={progressPercent}
        status={jobStatus}
      />

      {/* Iterations Display */}
      {iterations.length > 0 && (
        <div className="border-t pt-4 w-full space-y-2">
          <h3 className="text-lg font-medium mb-2">Research Iterations</h3>
          <div className="space-y-2">
            {iterations
              .sort((a, b) => a.iteration - b.iteration) // Ensure correct order
              .map((iteration) => {
                // Provide defaults for optional fields expected by IterationCard
                const iterationProps = {
                  ...iteration,
                  queries: iteration.queries ?? [],
                  results: iteration.results ?? [], // Removed 'as ResearchResult[]'
                  analysis: iteration.analysis ?? '',
                };
                // Use implicit return with parentheses
                return ( <IterationCard
                    key={iteration.iteration}
                    iteration={iterationProps} // Pass the object with defaults
                    isExpanded={expandedIterations.includes(iteration.iteration)}
                    onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
                  isStreaming={jobStatus === 'processing' && iteration.iteration === currentJobData?.current_iteration} // Stream only current iteration
                  isCurrentIteration={iteration.iteration === currentJobData?.current_iteration}
                  maxIterations={maxIterationsFromJob}
                /> )
              })}
          </div>
        </div>
      )}

      {/* Insights Display */}
      {processedInsights?.parsedData && (
        <div className="border-t pt-4 w-full">
          <h3 className="text-lg font-medium mb-2">Research Insights</h3>
          <InsightsDisplay
            streamingState={{
              rawText: processedInsights?.rawText ?? '',
              // Ensure parsedData exists and map areas_for_further_research
              parsedData: processedInsights?.parsedData
                ? {
                    ...processedInsights.parsedData,
                    // Ensure probability is always a string
                    probability: processedInsights.parsedData.probability ?? "N/A",
                    // Map the field name and provide default empty array
                    areasForResearch: processedInsights.parsedData.areas_for_further_research ?? [],
                    // Ensure reasoning exists or provide undefined/null if InsightsDisplay handles it
                    reasoning: processedInsights.parsedData.reasoning // Assuming reasoning is optional in source too
                  }
                : null, // Pass null if parsedData doesn't exist
            }}
            onResearchArea={onResearchArea}
            marketData={marketData}
          />
        </div>
      )}

      {/* Final Results Display (only when completed) */}
      {jobStatus === 'completed' && (
        <>
          {searchResults.length > 0 && (
            <div className="border-t pt-4 w-full">
              <h3 className="text-lg font-medium mb-2">Search Results</h3>
              <SitePreviewList results={searchResults} />
            </div>
          )}

          {finalAnalysis && (
            <div className="border-t pt-4 w-full">
              <h3 className="text-lg font-medium mb-2">Final Analysis</h3>
              <AnalysisDisplay content={finalAnalysis} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
