import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

// Configure CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle OPTIONS request for CORS
const handleCors = (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
};

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    console.log("Create research job function called");
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json();

    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating research job: marketId=${marketId}, maxIterations=${maxIterations}`);
    console.log(`Focus text: ${focusText || 'none'}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Create job entry
    console.log("Creating job entry in database");
    const createJobResponse = await fetch(`${supabaseUrl}/rest/v1/research_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey || "",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        market_id: marketId,
        query,
        max_iterations: maxIterations,
        focus_text: focusText || null,
        notification_email: notificationEmail || null,
        status: "queued"
      })
    });

    if (!createJobResponse.ok) {
      const errorText = await createJobResponse.text();
      console.error(`Error creating job: ${errorText}`);
      throw new Error(`Failed to create job: ${errorText}`);
    }

    const job = await createJobResponse.json();
    const jobId = job[0]?.id;

    if (!jobId) {
      throw new Error("No job ID returned from database");
    }

    console.log(`Created job with ID: ${jobId}`);
    
    // Start job processing in background
    EdgeRuntime.waitUntil(processJob(jobId, query, maxIterations, focusText));

    return new Response(
      JSON.stringify({ success: true, jobId }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error in create-research-job function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processJob(jobId: string, query: string, maxIterations: number, focusText?: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  try {
    console.log(`Processing job ${jobId}, max iterations: ${maxIterations}`);
    
    // Update job status to processing
    await updateJobStatus(jobId, "processing");
    await appendProgressLog(jobId, "Starting research process...");
    
    // Initialize iterations array if needed
    await initializeIterations(jobId, maxIterations);
    
    // Loop through iterations
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Starting iteration ${i} of ${maxIterations}`);
      await appendProgressLog(jobId, `Starting research iteration ${i}...`);
      
      // Update current iteration
      await updateCurrentIteration(jobId, i);
      
      // Generate queries for this iteration
      const queries = await generateQueries(jobId, query, i, focusText);
      if (!queries || queries.length === 0) {
        await appendProgressLog(jobId, "Failed to generate search queries. Moving to next iteration.");
        continue;
      }
      
      // Update iteration with queries
      await updateIterationField(jobId, i, "queries", JSON.stringify(queries));
      await appendProgressLog(jobId, `Generated ${queries.length} search queries`);
      
      // Search and collect results
      const results = await searchAndCollect(jobId, i, queries);
      if (!results || results.length === 0) {
        await appendProgressLog(jobId, "No search results found. Moving to next iteration.");
        continue;
      }
      
      // Update iteration with results
      await updateIterationField(jobId, i, "results", JSON.stringify(results));
      await appendProgressLog(jobId, `Found ${results.length} relevant search results`);
      
      // Generate analysis with streaming
      await appendProgressLog(jobId, "Generating analysis from search results...");
      await generateAnalysisWithStreaming(jobId, i, results, query, focusText);
      await appendProgressLog(jobId, "Completed analysis for this iteration");
    }
    
    // Generate final analysis
    await appendProgressLog(jobId, "All iterations complete. Generating final analysis...");
    const allResults = await getAllResults(jobId);
    if (allResults && allResults.length > 0) {
      await generateFinalAnalysisWithStreaming(jobId, allResults, query, focusText);
    }
    
    // Generate structured insights
    await appendProgressLog(jobId, "Extracting structured insights...");
    await extractStructuredInsights(jobId);
    
    // Send email notification if requested
    await sendNotificationIfNeeded(jobId);
    
    // Mark job as complete
    await updateJobStatus(jobId, "completed");
    await appendProgressLog(jobId, "Research job complete!");
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    await appendProgressLog(jobId, `Error: ${error.message}`);
    await updateJobStatus(jobId, "failed", error.message);
  }
}

async function updateJobStatus(jobId: string, status: string, errorMessage: string | null = null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Updating job ${jobId} status to ${status}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey || "",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      status: status,
      error_message: errorMessage
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error updating job status: ${errorText}`);
    throw new Error(`Failed to update job status: ${errorText}`);
  }
}

async function appendProgressLog(jobId: string, logMessage: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Appending to progress log for job ${jobId}: ${logMessage}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey || "",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      progress_log: {push: logMessage}
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error appending to progress log: ${errorText}`);
    throw new Error(`Failed to append to progress log: ${errorText}`);
  }
}

async function updateCurrentIteration(jobId: string, iteration: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Updating current iteration for job ${jobId} to ${iteration}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey || "",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      current_iteration: iteration
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error updating current iteration: ${errorText}`);
    throw new Error(`Failed to update current iteration: ${errorText}`);
  }
}

async function initializeIterations(jobId: string, maxIterations: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Initializing iterations array for job ${jobId} with ${maxIterations} iterations`);

  const iterations = Array.from({ length: maxIterations }, (_, i) => ({
    iteration: i + 1,
    queries: [],
    results: [],
    analysis: ""
  }));

  const response = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey || "",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      iterations: iterations
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error initializing iterations array: ${errorText}`);
    throw new Error(`Failed to initialize iterations array: ${errorText}`);
  }
}

async function generateQueries(jobId: string, query: string, iteration: number, focusText?: string): Promise<string[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Generating queries for job ${jobId}, iteration ${iteration}`);

  let prompt = `You are an expert at generating search queries for market research in prediction markets.
  The current research event is: ${query}. This is iteration ${iteration} of the research process.
  Generate 3 diverse search queries to find relevant information.
  ${focusText ? `The research should focus on: ${focusText}.` : ''}
  The queries should be specific and likely to yield high-quality results.`;

  const response = await fetch(`${supabaseUrl}/functions/v1/market-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ message: prompt })
  });

  if (!response.ok) {
    throw new Error(`Failed to generate queries: ${response.status}`);
  }

  const data = await response.json();
  const queries = data.choices?.[0]?.message?.content?.split('\n').filter((q: string) => q.trim() !== '').slice(0, 3) || [];
  console.log(`Generated queries: ${JSON.stringify(queries)}`);
  return queries;
}

async function searchAndCollect(jobId: string, iteration: number, queries: string[]): Promise<any[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Searching and collecting results for job ${jobId}, iteration ${iteration}`);

  const results = [];
  for (const query of queries) {
    console.log(`Searching for query: ${query}`);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ query: query })
      });

      if (!response.ok) {
        console.error(`Failed to scrape: ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (data && data.data && Array.isArray(data.data)) {
        results.push(...data.data);
      }
    } catch (error) {
      console.error(`Error during scraping: ${error}`);
    }
  }

  console.log(`Collected ${results.length} results`);
  return results;
}

async function updateIterationField(jobId: string, iteration: number, fieldKey: string, fieldValue: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Updating iteration ${iteration}, field ${fieldKey} for job ${jobId}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/update_iteration_field`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey || "",
    },
    body: JSON.stringify({
      job_id: jobId,
      iteration_num: iteration,
      field_key: fieldKey,
      field_value: fieldValue
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error updating iteration field: ${errorText}`);
    throw new Error(`Failed to update iteration field: ${errorText}`);
  }
}

async function getAllResults(jobId: string): Promise<any[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Getting all results for job ${jobId}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}&select=iterations`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey || "",
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error getting iterations: ${errorText}`);
    throw new Error(`Failed to get iterations: ${errorText}`);
  }

  const data = await response.json();
  const iterations = data[0]?.iterations || [];
  const allResults = iterations.reduce((acc: any[], iteration: any) => {
    if (iteration.results && typeof iteration.results === 'string') {
      try {
        const parsedResults = JSON.parse(iteration.results);
        if (Array.isArray(parsedResults)) {
          acc.push(...parsedResults);
        }
      } catch (e) {
        console.error("Failed to parse results string:", e);
      }
    } else if (iteration.results && Array.isArray(iteration.results)) {
      acc.push(...iteration.results);
    }
    return acc;
  }, []);

  console.log(`Total results found: ${allResults.length}`);
  return allResults;
}

// Update this function to use the streaming endpoint
async function generateFinalAnalysisWithStreaming(jobId: string, allResults: any[], query: string, focusText?: string) {
  try {
    console.log(`Generating final analysis with streaming for job ${jobId}`);
    
    // Prepare content for analysis
    const resultsText = allResults
      .map((result, index) => `[${index + 1}] ${result.title || result.url}\n${result.content.slice(0, 1000)}...\n\n`)
      .join("\n");
      
    const prompt = `You are a market research analyst specializing in prediction markets. 
    Please analyze the following search results to help determine the probability of the event described.
    
    EVENT: ${query}
    
    ${focusText ? `FOCUS AREA: ${focusText}\n\n` : ''}
    
    SEARCH RESULTS:
    ${resultsText}
    
    Based on these search results, provide a detailed analysis including:
    1. Summary of key information
    2. Analysis of evidence for and against the event
    3. Any notable expert opinions or relevant data
    4. Identification of knowledge gaps or areas of uncertainty
    5. Overall assessment of the situation
    
    Do not make up any information not present in the search results. If there's insufficient information, acknowledge that fact.`;
    
    // Use the market-analysis function for streaming
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/market-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        message: prompt,
        jobId: jobId,
        isFinalAnalysis: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to call market-analysis function: ${response.status}`);
    }
    
    console.log("Final analysis streaming started successfully");
    return true;
  } catch (error) {
    console.error(`Error generating final analysis: ${error}`);
    throw error;
  }
}

// Update this function to use the streaming endpoint
async function generateAnalysisWithStreaming(jobId: string, iteration: number, results: any[], query: string, focusText?: string) {
  try {
    console.log(`Generating analysis for job ${jobId}, iteration ${iteration} with streaming`);
    
    // Prepare content for analysis
    const resultsText = results
      .map((result, index) => `[${index + 1}] ${result.title || result.url}\n${result.content.slice(0, 1000)}...\n\n`)
      .join("\n");
      
    const prompt = `You are a market research analyst specializing in prediction markets. 
    This is iteration ${iteration} of the research process.
    
    Please analyze the following search results to help determine the probability of the event described.
    
    EVENT: ${query}
    
    ${focusText ? `FOCUS AREA: ${focusText}\n\n` : ''}
    
    SEARCH RESULTS:
    ${resultsText}
    
    Based on these search results, provide a concise analysis including:
    1. Summary of key information
    2. Analysis of evidence for and against the event
    3. Any notable expert opinions or relevant data
    
    Also suggest 2-3 specific topics for further research that could help narrow uncertainty.`;
    
    // Use the market-analysis function for streaming
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/market-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        message: prompt,
        jobId: jobId,
        iterationNumber: iteration
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to call market-analysis function: ${response.status}`);
    }
    
    console.log(`Analysis for iteration ${iteration} streaming started successfully`);
    return true;
  } catch (error) {
    console.error(`Error generating analysis: ${error}`);
    throw error;
  }
}

async function extractStructuredInsights(jobId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Extracting structured insights for job ${jobId}`);

  try {
    // Get all results and final analysis
    const getJobResponse = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}&select=final_analysis_stream`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey || "",
      }
    });

    if (!getJobResponse.ok) {
      const errorText = await getJobResponse.text();
      console.error(`Error getting job data: ${errorText}`);
      throw new Error(`Failed to get job data: ${errorText}`);
    }

    const jobData = await getJobResponse.json();
    const finalAnalysis = jobData[0]?.final_analysis_stream || "";

    // Call the function to extract structured insights
    const response = await fetch(`${supabaseUrl}/functions/v1/insights-extraction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ text: finalAnalysis })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to extract insights: ${errorText}`);
      throw new Error(`Failed to extract insights: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Extracted insights: ${JSON.stringify(data)}`);

    // Update the research_jobs table with the structured insights
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey || "",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        results: {
          structuredInsights: data
        }
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`Error updating job with insights: ${errorText}`);
      throw new Error(`Failed to update job with insights: ${errorText}`);
    }

    console.log("Structured insights extraction and update complete");

  } catch (error) {
    console.error("Error in extractStructuredInsights:", error);
    throw error;
  }
}

async function sendNotificationIfNeeded(jobId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`Checking if notification is needed for job ${jobId}`);

  try {
    // Get job details
    const getJobResponse = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}&select=notification_email,notification_sent`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey || "",
      }
    });

    if (!getJobResponse.ok) {
      const errorText = await getJobResponse.text();
      console.error(`Error getting job data: ${errorText}`);
      throw new Error(`Failed to get job data: ${errorText}`);
    }

    const jobData = await getJobResponse.json();
    const notificationEmail = jobData[0]?.notification_email;
    const notificationSent = jobData[0]?.notification_sent;

    if (notificationEmail && !notificationSent) {
      console.log(`Sending notification email to ${notificationEmail}`);

      // Call the function to send email
      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          to: notificationEmail,
          subject: "Research Job Complete",
          body: `Your research job ${jobId} is complete. Check it out now!`
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send email: ${errorText}`);
        throw new Error(`Failed to send email: ${errorText}`);
      }

      // Update the research_jobs table to mark notification as sent
      const updateResponse = await fetch(`${supabaseUrl}/rest/v1/research_jobs?id=eq.${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey || "",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          notification_sent: true
        })
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error(`Error updating job with notification status: ${errorText}`);
        throw new Error(`Failed to update job with notification status: ${errorText}`);
      }

      console.log("Notification email sent successfully");
    } else {
      console.log("No notification needed or already sent.");
    }

  } catch (error) {
    console.error("Error in sendNotificationIfNeeded:", error);
    throw error;
  }
}
