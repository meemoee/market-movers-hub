import { useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast"; // Keep for potential direct toasts if needed

// Import centralized types
import { ResearchJob, JobQueueResearchCardProps, MarketContextData } from '@/types/research';

// Import the new hooks
import { useResearchJobState } from '@/hooks/research/useResearchJobState';
import { useSavedResearchJobs } from '@/hooks/research/useSavedResearchJobs';

// Import the new components
import { ResearchJobForm } from './research/ResearchJobForm';
import { ResearchJobHistory } from './research/ResearchJobHistory';
import { CurrentJobDisplay } from './research/CurrentJobDisplay';

// Main refactored component
export function JobQueueResearchCard({
  description,
  marketId,
  bestBid,
  bestAsk,
  noBestAsk,
  noBestBid,
  outcomes
}: JobQueueResearchCardProps) {
  const { toast } = useToast(); // Keep toast hook if needed for top-level notifications

  // Prepare market context data for calculations within the state hook
  const marketData: MarketContextData = { bestBid, bestAsk, noBestAsk, noBestBid, outcomes };

  // Hook to manage the state of the job being displayed (active or loaded)
  const {
    // State pieces needed by CurrentJobDisplay
    currentJobId,
    jobStatus,
    progressLog,
    progressPercent,
    iterations,
    finalResults,
    processedInsights,
    error: jobStateError, // Renamed to avoid conflict with history hook error
    isLoading: isLoadingJobState, // Renamed to avoid conflict
    currentJobData,
    // Control functions
    loadJob,
    resetJobState,
  } = useResearchJobState(marketData); // Pass market data for calculations

  // Hook to fetch and manage the list of saved jobs
  const {
    savedJobs,
    isLoadingJobs,
    error: historyError, // Keep separate error state for history loading
    refetchJobs,
  } = useSavedResearchJobs(marketId);

  // --- Callbacks to connect components and hooks ---

  // Called by ResearchJobForm when a new job is successfully created
  const handleJobCreated = useCallback((newJobId: string) => {
    refetchJobs(); // Refresh history list
    loadJob(newJobId); // Load the new job (state hook will fetch details & subscribe)
  }, [loadJob, refetchJobs]);

  // Called by ResearchJobHistory when a job is selected
  const handleLoadSavedJob = useCallback((job: ResearchJob) => {
    console.log(`[JobQueueResearchCard] Loading saved job: ${job.id}`);
    loadJob(job); // Tell the state hook to load this job's data
  }, [loadJob]);

  // Called by the "New Research" button when a job is currently displayed
  const handleNewResearch = useCallback(() => {
    console.log('[JobQueueResearchCard] Resetting display for new research.');
    resetJobState(); // Clear the display to show the form
  }, [resetJobState]);

  // Called by InsightsDisplay (via CurrentJobDisplay) to start focused research
  const handleResearchArea = useCallback((area: string) => {
    console.log(`[JobQueueResearchCard] Starting focused research on: ${area}`);
    // Reset state first to show the form
    resetJobState();
    // Need a way to trigger the form submission with the focus text.
    // Option 1: Pass a function down to CurrentJobDisplay -> InsightsDisplay? Seems complex.
    // Option 2: Modify useResearchJobForm to accept an initial focus text? Better.
    // Option 3: For now, just reset and let user manually enter focus (simplest)
    toast({
      title: "Starting Focused Research",
      description: `Enter "${area}" in the focus area input and start research.`,
    });
    // Ideally, we'd pre-fill the form and potentially auto-submit,
    // but that requires more complex state passing or context.
    // Let's stick to resetting for now.
  }, [resetJobState, toast]);


  // Determine if the history dropdown should be disabled (e.g., while loading state or form)
  const isHistoryDisabled = isLoadingJobState || !currentJobId; // Disable if loading state or form is shown

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      {/* Header Section */}
      <div className="flex items-center justify-between w-full max-w-full">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Background Job Research</h2>
           <p className="text-sm text-muted-foreground">
             Run deep research in the background. Results update live.
           </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {currentJobId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewResearch}
              disabled={isLoadingJobState} // Disable if loading job state
            >
              New Research
            </Button>
          ) : null }
          <ResearchJobHistory
            jobs={savedJobs}
            isLoading={isLoadingJobs}
            onSelectJob={handleLoadSavedJob}
            disabled={isHistoryDisabled}
          />
        </div>
      </div>

      {/* Display Area: Form or Current Job Details */}
      <div className="w-full max-w-full">
        {!currentJobId && !isLoadingJobState ? (
          // Show form only if no job is loaded/active AND not currently loading a job state
          <ResearchJobForm
            marketId={marketId}
            description={description}
            onJobCreated={handleJobCreated}
          />
        ) : (
          // Show current job display (handles its own loading state internally if needed)
          <CurrentJobDisplay
            jobId={currentJobId}
            jobStatus={jobStatus}
            progressLog={progressLog}
            progressPercent={progressPercent}
            iterations={iterations}
            finalResults={finalResults}
            processedInsights={processedInsights}
            error={jobStateError}
            isLoading={isLoadingJobState} // Pass down loading state
            currentJobData={currentJobData}
            marketData={marketData}
            onResearchArea={handleResearchArea}
          />
        )}
        {/* Display history loading error if any */}
         {historyError && (
            <p className="text-xs text-red-500 mt-2">Error loading history: {historyError}</p>
         )}
      </div>
    </Card>
  );
}
