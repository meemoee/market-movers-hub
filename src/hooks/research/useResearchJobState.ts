import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ResearchJob,
  ResearchIteration,
  ResearchResult,
  FinalResearchResults,
  StructuredInsights,
  InsightsDisplayData,
  GoodBuyOpportunity,
  MarketContextData,
} from '@/types/research';
import { useResearchJobRealtime } from './useResearchJobRealtime'; // Import the realtime hook

// --- Utility Functions (Consider moving to src/lib/researchUtils.ts later) ---

/**
 * Parses the 'results' field from a ResearchJob, which might be a stringified JSON or an object.
 */
function parseFinalResults(resultsData: any): FinalResearchResults | null {
  if (!resultsData) return null;
  if (typeof resultsData === 'object') {
    // Already an object, assume it matches FinalResearchResults structure
    // Add validation here if needed
    return resultsData as FinalResearchResults;
  }
  if (typeof resultsData === 'string') {
    try {
      return JSON.parse(resultsData) as FinalResearchResults;
    } catch (e) {
      console.error('[parseFinalResults] Error parsing results string:', e);
      return { analysis: `Error: Failed to parse results data. Raw: ${resultsData}` }; // Return error state
    }
  }
  console.error('[parseFinalResults] Unexpected results type:', typeof resultsData);
  return { analysis: `Error: Unexpected results type: ${typeof resultsData}` }; // Return error state
}

/**
 * Calculates potential good buy opportunities based on insights and market data.
 */
function calculateGoodBuyOpportunities(
  probabilityStr: string | undefined | null,
  marketData: MarketContextData | null
): GoodBuyOpportunity[] | null {
  if (!probabilityStr || !marketData || !marketData.outcomes || marketData.outcomes.length < 2 || marketData.bestAsk === undefined) {
    console.log('[calculateGoodBuyOpportunities] Missing data for calculation.');
    return null;
  }

  const probability = parseInt(probabilityStr.replace('%', '').trim()) / 100;
  if (isNaN(probability)) {
    console.log(`[calculateGoodBuyOpportunities] Invalid probability format: ${probabilityStr}`);
    return null;
  }

  console.log(`[calculateGoodBuyOpportunities] Calculating opportunities with probability ${probability}, bestAsk ${marketData.bestAsk}`);

  const THRESHOLD = 0.05; // Example threshold
  const opportunities: GoodBuyOpportunity[] = [];
  const { bestAsk, bestBid, noBestAsk, outcomes } = marketData;

  // Opportunity for YES outcome
  if (bestAsk !== undefined && probability > bestAsk + THRESHOLD) {
    console.log(`[calculateGoodBuyOpportunities] Found opportunity for YES: ${probability} vs ${bestAsk}`);
    opportunities.push({
      outcome: outcomes[0],
      predictedProbability: probability,
      marketPrice: bestAsk,
      difference: (probability - bestAsk).toFixed(2),
    });
  }

  // Opportunity for NO outcome
  const inferredNoProbability = 1 - probability;
  // Use noBestAsk if available, otherwise infer from bestBid
  const noAskPrice = noBestAsk !== undefined ? noBestAsk : (bestBid !== undefined ? 1 - bestBid : undefined);

  if (noAskPrice !== undefined && inferredNoProbability > noAskPrice + THRESHOLD) {
     console.log(`[calculateGoodBuyOpportunities] Found opportunity for NO: ${inferredNoProbability} vs ${noAskPrice}`);
     opportunities.push({
       outcome: outcomes[1] || "NO", // Fallback label
       predictedProbability: inferredNoProbability,
       marketPrice: noAskPrice,
       difference: (inferredNoProbability - noAskPrice).toFixed(2),
     });
  }


  return opportunities.length > 0 ? opportunities : null;
}

// --- Hook Definition ---

/**
 * Manages the state and updates for a single research job (active or loaded).
 * Integrates with Supabase Realtime for live updates.
 * @param initialMarketData - Static market context data (bestBid, bestAsk, etc.) needed for calculations.
 * @returns An object containing the current job state and functions to load/reset the job.
 */
export function useResearchJobState(initialMarketData: MarketContextData | null) {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ResearchJob['status'] | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [iterations, setIterations] = useState<ResearchIteration[]>([]);
  const [finalResults, setFinalResults] = useState<FinalResearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Loading state for fetching job data by ID
  const [currentJobData, setCurrentJobData] = useState<ResearchJob | null>(null); // State to hold the full job object

  // Processed/derived state
  const [processedInsights, setProcessedInsights] = useState<InsightsDisplayData | null>(null);

  // --- Internal Data Processing Logic ---

  // Memoized function to process a full ResearchJob object and update state
  const processJobData = useCallback((job: ResearchJob | null) => {
    if (!job) {
      // Reset state if job is null
      setCurrentJobId(null);
      setJobStatus(null);
      setProgressLog([]);
      setProgressPercent(0);
      setIterations([]);
      setFinalResults(null);
      setError(null);
      setProcessedInsights(null);
      setCurrentJobData(null); // Clear the full job data as well
      return;
    }

    console.log(`[useResearchJobState] Processing job update for job: ${job.id}, status: ${job.status}`);

    // Set the full job data first
    setCurrentJobData(job);

    // Update individual state pieces based on the job data
    setCurrentJobId(job.id);
    setJobStatus(job.status);
    setError(job.error_message || null);

    // Calculate progress percentage
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = job.status === 'completed' ? 100 : Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(percent);
    } else {
      setProgressPercent(job.status === 'completed' ? 100 : 0);
    }

    // Update progress log (append new messages)
    if (job.progress_log && Array.isArray(job.progress_log)) {
       // Simple approach: replace log entirely. Could optimize to append if needed.
       setProgressLog(job.progress_log);
    } else {
       setProgressLog([]);
    }


    // Update iterations
    if (job.iterations && Array.isArray(job.iterations)) {
      // Assume job.iterations conforms to ResearchIteration[] after casting in fetch/realtime
      setIterations(job.iterations);
    } else {
      setIterations([]);
    }

    // Process final results when completed
    let parsedResults: FinalResearchResults | null = null;
    if (job.status === 'completed' && job.results) {
      parsedResults = parseFinalResults(job.results);
      setFinalResults(parsedResults);
    } else if (job.status !== 'completed') {
      // Clear final results if job is not completed
      setFinalResults(null);
    }

    // Process structured insights (derived from final results)
    if (parsedResults?.structuredInsights) {
      const insights = parsedResults.structuredInsights;
      const opportunities = calculateGoodBuyOpportunities(insights.probability, initialMarketData);
      setProcessedInsights({
        rawText: typeof insights === 'string' ? insights : JSON.stringify(insights), // Store raw for potential display
        parsedData: {
          ...insights,
          goodBuyOpportunities: opportunities,
        },
      });
    } else if (job.status !== 'completed') {
       // Clear insights if job is not completed
       setProcessedInsights(null);
    }

    // If job failed, ensure error state is set and potentially add to log
    if (job.status === 'failed' && job.error_message) {
      setError(`Job failed: ${job.error_message}`);
      // Optionally add failure message to progress log if not already present
      setProgressLog(prev => prev.includes(job.error_message!) ? prev : [...prev, `Job failed: ${job.error_message}`]);
    }

  }, [initialMarketData]); // Dependency: market data for calculations

  // --- Realtime Subscription ---

  // Callback for realtime updates
  const handleRealtimeUpdate = useCallback((updatedJob: ResearchJob) => {
    console.log(`[useResearchJobState] Received realtime update for job: ${updatedJob.id}`);
    processJobData(updatedJob);
  }, [processJobData]); // Depends on the processing function

  // Setup realtime subscription using the dedicated hook
  useResearchJobRealtime({
    jobId: currentJobId, // Subscribe only when there's an active job ID
    onUpdate: handleRealtimeUpdate,
    onError: (err) => {
      console.error("[useResearchJobState] Realtime subscription error:", err);
      setError(`Realtime connection error: ${err.message || 'Unknown error'}`);
      // Optionally try to reset or handle the error state
    },
    // onStatusChange: (status, err) => { ... } // Optional: handle status changes
  });

  // --- Public Functions ---

  // Function to load a job, either from a full object or by fetching its ID
  const loadJob = useCallback(async (jobIdOrObject: string | ResearchJob) => {
    setIsLoading(true);
    setError(null); // Clear previous errors
    console.log(`[useResearchJobState] loadJob called with:`, jobIdOrObject);

    if (typeof jobIdOrObject === 'string') {
      // Fetch job data by ID
      const jobId = jobIdOrObject;
      setCurrentJobId(jobId); // Set ID immediately to trigger realtime subscription
      try {
        console.log(`[useResearchJobState] Fetching job data for ID: ${jobId}`);
        const { data, error: fetchError } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (fetchError) {
          console.error(`[useResearchJobState] Error fetching job ${jobId}:`, fetchError);
          setError(`Failed to load job: ${fetchError.message}`);
          processJobData(null); // Reset state on error
          setCurrentJobId(null); // Clear ID to stop potential realtime subscription attempts
        } else if (data) {
          console.log(`[useResearchJobState] Successfully fetched job data for ${jobId}`);
      // Process the fetched data (casting needed as before)
      const fetchedJob = data as unknown as ResearchJob;
      processJobData(fetchedJob);
    } else {
      console.warn(`[useResearchJobState] Job not found: ${jobId}`);
      setError("Research job not found.");
      processJobData(null); // Resets state including currentJobId via processJobData(null)
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[useResearchJobState] Exception fetching job ${jobId}:`, e);
    setError(`An unexpected error occurred while loading the job: ${errorMsg}`);
    processJobData(null); // Resets state including currentJobId via processJobData(null)
  } finally {
    setIsLoading(false);
      }
    } else {
      // Process the provided job object directly
      const jobObject = jobIdOrObject;
      console.log(`[useResearchJobState] Processing provided job object for ID: ${jobObject.id}`);
      processJobData(jobObject);
      // No need to set loading false here as it wasn't set true for object loading
      setIsLoading(false); // Ensure loading is false
    }
  }, [processJobData]); // Depends on the processing function

  // Function to reset the state, clearing the currently displayed job
  const resetJobState = useCallback(() => {
    console.log('[useResearchJobState] Resetting job state.');
    processJobData(null); // Calling processJobData with null resets all state fields
  }, [processJobData]);

  // --- Return Value ---

  // Return the essential state pieces and control functions
  // The consuming component can use currentJobData for static fields if needed
  return {
    currentJobId,
    jobStatus,
    progressLog,
    progressPercent,
    iterations,
    finalResults, // Raw final results object (parsed)
    processedInsights, // Derived insights data for display (includes opportunities)
    error,
    isLoading, // Loading state specifically for fetching job by ID
    currentJobData, // Expose the full job data object
    loadJob,
    resetJobState,
  };
}
