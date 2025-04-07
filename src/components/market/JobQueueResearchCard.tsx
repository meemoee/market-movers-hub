import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { IterationCard } from "./research/IterationCard"
import { ResearchStatusBadge } from "./research/ResearchStatusBadge"
import { ResearchForm } from "./research/ResearchForm"
import { ResearchHistory } from "./research/ResearchHistory"
import { useResearchJob } from '@/hooks/useResearchJob'
import { useResearchHistory } from '@/hooks/useResearchHistory'

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number; 
  noBestBid?: number;
  outcomes?: string[];
}

export function JobQueueResearchCard({ 
  description, 
  marketId, 
  bestBid, 
  bestAsk, 
  noBestAsk,
  noBestBid,
  outcomes 
}: JobQueueResearchCardProps) {
  const {
    jobId,
    jobStatus,
    isLoading,
    progress,
    progressPercent,
    error,
    iterations,
    expandedIterations,
    results,
    analysis,
    structuredInsights,
    focusText,
    maxIterations,
    setFocusText,
    handleResearch,
    resetState,
    loadJobData,
    toggleIterationExpand
  } = useResearchJob(marketId);
  
  const {
    savedJobs,
    isLoadingJobs,
    isLoadingSaved,
    loadSavedResearch,
    extractProbability
  } = useResearchHistory(marketId);

  const handleClearDisplay = () => {
    resetState();
    setFocusText('');
  };

  const handleLoadSavedResearch = (jobId: string) => {
    loadSavedResearch(jobId, loadJobData);
  };

  const handleStartResearch = (focusText: string, maxIterations: number, email: string) => {
    handleResearch(focusText, maxIterations, email);
  };
  
  const handleResearchArea = (area: string) => {
    setFocusText('');
    handleResearch(area);
  };

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between w-full max-w-full">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Background Job Research</h2>
            <ResearchStatusBadge status={jobStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            This research continues in the background even if you close your browser.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {jobId ? (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearDisplay}
              disabled={isLoading || isLoadingSaved}
            >
              New Research
            </Button>
          ) : (
            <Button 
              onClick={() => handleResearch()} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Starting..." : "Start Research"}
            </Button>
          )}
          
          <ResearchHistory 
            savedJobs={savedJobs} 
            isLoading={isLoadingJobs || isLoadingSaved} 
            onSelectJob={handleLoadSavedResearch}
            extractProbability={extractProbability}
          />
        </div>
      </div>

      {!jobId && (
        <ResearchForm onStartResearch={handleStartResearch} isLoading={isLoading} />
      )}

      {focusText && jobId && (
        <div className="bg-accent/10 px-3 py-2 rounded-md text-sm">
          <span className="font-medium">Research focus:</span> {focusText}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-2 rounded w-full max-w-full">
          {error}
        </div>
      )}

      {jobId && (
        <ProgressDisplay 
          messages={progress} 
          jobId={jobId || undefined} 
          progress={progressPercent}
          status={jobStatus}
        />
      )}
      
      {iterations.length > 0 && (
        <div className="border-t pt-4 w-full max-w-full space-y-2">
          <h3 className="text-lg font-medium mb-2">Research Iterations</h3>
          <div className="space-y-2">
            {iterations.map((iteration) => (
              <IterationCard
                key={iteration.iteration}
                iteration={iteration}
                isExpanded={expandedIterations.includes(iteration.iteration)}
                onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
                isStreaming={jobStatus === 'processing'}
                isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
                maxIterations={maxIterations}
              />
            ))}
          </div>
        </div>
      )}
      
      {structuredInsights && structuredInsights.parsedData && (
        <div className="border-t pt-4 w-full max-w-full">
          <h3 className="text-lg font-medium mb-2">Research Insights</h3>
          <InsightsDisplay 
            streamingState={structuredInsights} 
            onResearchArea={handleResearchArea}
            marketData={{
              bestBid,
              bestAsk,
              noBestAsk,
              outcomes
            }}
          />
        </div>
      )}
      
      {results.length > 0 && (
        <>
          <div className="border-t pt-4 w-full max-w-full">
            <h3 className="text-lg font-medium mb-2">Search Results</h3>
            <SitePreviewList results={results} />
          </div>
          
          {analysis && (
            <div className="border-t pt-4 w-full max-w-full">
              <h3 className="text-lg font-medium mb-2">Final Analysis</h3>
              <AnalysisDisplay 
                content={analysis} 
                isStreaming={jobStatus === 'processing'}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
