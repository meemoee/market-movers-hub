import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Queue } from "https://deno.land/x/queue@v1.2.1/mod.ts";

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

// Supabase client
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Constants
const MAX_CONCURRENT_JOBS = 3;

// Define the queue
const jobQueue = new Queue({ concurrency: MAX_CONCURRENT_JOBS });

interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  focus_text?: string;
  status: string;
  current_iteration: number;
  max_iterations: number;
  iterations: any[];
  progress_log: any[];
  created_at: string;
}

// Listen for new research jobs
async function listenForNewJobs(): Promise<void> {
  console.log('Listening for new research jobs...');
  
  supabaseClient
    .channel('research_jobs')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'research_jobs' },
      async (payload) => {
        const job = payload.new as ResearchJob;
        console.log(`Received new job: ${job.id}`);
        
        // Add the job to the queue
        jobQueue.add(() => processResearchJob(job));
      }
    )
    .subscribe();
}

// Main research job processing function
async function processResearchJob(job: ResearchJob): Promise<void> {
  try {
    console.log(`Starting to process job ${job.id}, query: "${job.query}"`);
    
    // Update job status to processing
    await updateJobStatus(job.id, 'processing');
    
    // Extract previous queries from all iterations if any
    const previousQueries = job.iterations.flatMap((iteration: any) => 
      iteration.queries || []
    );
    
    // Generate search queries for this iteration
    console.log(`Generating queries for iteration ${job.current_iteration + 1}`);
    const searchQueries = await generateQueries(job.query, job.market_id, job.focus_text, job.current_iteration + 1, previousQueries);
    
    // Log the generated queries
    console.log(`Generated queries: ${JSON.stringify(searchQueries)}`);
    
    // Web research for each query
    const researchResults = [];
    for (const searchQuery of searchQueries) {
      console.log(`Starting web research for query: "${searchQuery}"`);
      
      // Invoke the web-research function
      const webResearchResult = await webResearch(job.market_id, searchQuery, job.focus_text);
      
      // Log the web research result
      console.log(`Web research result: ${JSON.stringify(webResearchResult)}`);
      
      researchResults.push(webResearchResult);
    }
    
    // Consolidate research results
    const consolidatedAnalysis = consolidateResearch(researchResults);
    
    // Log the consolidated analysis
    console.log(`Consolidated analysis: ${JSON.stringify(consolidatedAnalysis)}`);
    
    // Update iterations and progress log
    const iterationData = {
      iteration: job.current_iteration + 1,
      queries: searchQueries,
      results: researchResults,
      analysis: consolidatedAnalysis
    };
    
    await appendResearchIteration(job.id, iterationData);
    await appendResearchProgress(job.id, `Completed iteration ${job.current_iteration + 1}`);
    
    // Check if the job is complete
    if (job.current_iteration + 1 >= job.max_iterations) {
      console.log(`Job ${job.id} complete`);
      await updateJobStatus(job.id, 'completed');
      await updateResearchResults(job.id, consolidatedAnalysis);
    } else {
      // Update job status to pending and increment iteration
      console.log(`Job ${job.id} not complete, updating to pending and incrementing iteration`);
      await updateJobStatus(job.id, 'pending', job.current_iteration + 1);
    }
  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    await updateJobStatus(job.id, 'failed', undefined, error.message);
  }
}

// Function to generate search queries
async function generateQueries(
  query: string,
  marketId: string,
  focusText?: string,
  iteration = 1,
  previousQueries: string[] = []
): Promise<string[]> {
  try {
    console.log(`Generating queries for: "${query}" ${focusText ? `with focus on "${focusText}"` : ''} (iteration ${iteration})`);
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        query,
        marketId,
        focusText,
        iteration,
        previousQueries
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to generate queries: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.queries || [];
  } catch (error) {
    console.error('Error generating queries:', error);
    
    // Return fallback queries if API call fails
    return [
      `${query} latest developments`,
      `${query} expert analysis`,
      `${query} historical data`,
      `${query} statistics and probabilities`,
      `${query} future projections`
    ];
  }
}

// Function to perform web research
async function webResearch(marketId: string, query: string, focusText?: string): Promise<any> {
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/web-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        marketId,
        query,
        focusText
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to perform web research: ${response.status} ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error performing web research:', error);
    return { error: error.message };
  }
}

// Function to consolidate research results
function consolidateResearch(results: any[]): any {
  // Basic consolidation logic - can be expanded
  const allSources = results.flatMap(result => result.sources || []);
  const allAnalysis = results.map(result => result.analysis).join('\n');
  
  return {
    sources: allSources,
    analysis: allAnalysis
  };
}

// Function to update job status
async function updateJobStatus(jobId: string, newStatus: string, currentIteration?: number, errorMsg?: string): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from('research_jobs')
      .update({ status: newStatus, current_iteration: currentIteration, error_message: errorMsg })
      .eq('id', jobId);
    
    if (error) {
      throw new Error(`Failed to update job status: ${error.message}`);
    }
    
    console.log(`Job ${jobId} status updated to ${newStatus}`);
  } catch (error) {
    console.error('Error updating job status:', error);
  }
}

// Function to append research iteration
async function appendResearchIteration(jobId: string, iterationData: any): Promise<void> {
  try {
    const { error } = await supabaseClient.rpc(
      'append_research_iteration',
      { job_id: jobId, iteration_data: iterationData }
    );
    
    if (error) {
      throw new Error(`Failed to append research iteration: ${error.message}`);
    }
    
    console.log(`Appended research iteration to job ${jobId}`);
  } catch (error) {
    console.error('Error appending research iteration:', error);
  }
}

// Function to append research progress
async function appendResearchProgress(jobId: string, progressEntry: string): Promise<void> {
  try {
    const { error } = await supabaseClient.rpc(
      'append_research_progress',
      { job_id: jobId, progress_entry: progressEntry }
    );
    
    if (error) {
      throw new Error(`Failed to append research progress: ${error.message}`);
    }
    
    console.log(`Appended research progress to job ${jobId}`);
  } catch (error) {
    console.error('Error appending research progress:', error);
  }
}

// Function to update research results
async function updateResearchResults(jobId: string, resultData: any): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from('research_jobs')
      .update({ results: resultData })
      .eq('id', jobId);
    
    if (error) {
      throw new Error(`Failed to update research results: ${error.message}`);
    }
    
    console.log(`Updated research results for job ${jobId}`);
  } catch (error) {
    console.error('Error updating research results:', error);
  }
}

// Start the job listener
listenForNewJobs();

serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() != "websocket") {
    return new Response("Expected a websocket");
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("WebSocket connected");
  };

  socket.onmessage = (ev) => {
    console.log("WebSocket message:", ev.data);
    socket.send(ev.data);
  };

  socket.onerror = (ev) => {
    console.error("WebSocket error:", ev.error);
  };

  socket.onclose = () => {
    console.log("WebSocket closed");
  };

  return response;
});
