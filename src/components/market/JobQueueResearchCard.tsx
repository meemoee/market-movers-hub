import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useResearchJob } from "@/hooks/useResearchJob"
import { useResearchHistory } from "@/hooks/useResearchHistory"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { IterationCard } from "./research/IterationCard"
import { ResearchStatusBadge } from "./research/ResearchStatusBadge"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { ResearchForm } from "./research/ResearchForm"
import { ResearchHistory } from "./research/ResearchHistory"
import { ResearchJob } from "@/types/research"

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
  const [focusText, setFocusText] = useState<string>('')
  const { toast } = useToast()
  
  const { 
    isLoading,
    progress,
    progressPercent,
    results,
    error,
    analysis,
    jobId,
    iterations,
    expandedIterations,
    jobStatus,
    structuredInsights,
    handleResearch,
    loadJobData,
    resetState,
    toggleIterationExpand
  } = useResearchJob({
    marketId,
    bestBid,
    bestAsk,
    noBestAsk,
    noBestBid,
    outcomes,
    onJobComplete: () => {
      historyUtils.fetchSavedJobs();
    }
  });

  const historyUtils = useResearchHistory({
    marketId
  });

  const handleClearDisplay = () => {
    console.log('Clearing display and resetting state');
    resetState();
    setFocusText('');
  };

  const handleResearchArea = (area: string) => {
    console.log('Starting focused research on:', area);
    setFocusText('');
    
    toast({
      title: "Starting Focused Research",
      description: `Creating new research job focused on: ${area}`,
    });
    
    handleStartResearch(area, 3, false, '');
  };

  const handleStartResearch = (
    initialFocusText: string, 
    maxIterations: number, 
    notifyByEmail: boolean, 
    notificationEmail: string
  ) => {
    const useFocusText = initialFocusText || focusText;
    setFocusText(useFocusText);
    
    handleResearch(description, useFocusText);
    
    if (notifyByEmail && notificationEmail) {
      toast({
        title: "Email Notification Enabled",
        description: `You will be notified at ${notificationEmail} when the research is complete.`,
      });
    }
  };

  const handleLoadSavedResearch = async (jobId: string) => {
    const job = await historyUtils.loadSavedResearch(jobId);
    if (job) {
      loadJobData(job as ResearchJob);
      if (job.focus_text) {
        setFocusText(job.focus_text);
      }
      toast({
        title: "Research Loaded",
        description: `Loaded research job ${job.focus_text ? `focused on: ${job.focus_text}` : ''}`,
      });
    }
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
              disabled={isLoading || historyUtils.isLoadingSaved}
            >
              New Research
            </Button>
          ) : (
            <Button 
              onClick={() => handleStartResearch(focusText, 3, false, '')} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? "Starting..." : "Start Research"}
            </Button>
          )}
          
          <ResearchHistory 
            jobs={historyUtils.savedJobs}
            isLoading={historyUtils.isLoadingJobs || historyUtils.isLoadingSaved}
            onLoadJob={handleLoadSavedResearch}
            extractProbability={historyUtils.extractProbability}
          />
        </div>
      </div>

      {!jobId && (
        <ResearchForm 
          onStartResearch={handleStartResearch} 
          isLoading={isLoading} 
        />
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
                maxIterations={parseInt(iterations.length > 0 ? iterations[iterations.length - 1].iteration : '3', 10)}
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
              <AnalysisDisplay content={analysis} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
