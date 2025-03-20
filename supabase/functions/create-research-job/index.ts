
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { backOff } from 'https://esm.sh/exponential-backoff@3.1.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

// Database connection info
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Parse request body
    const requestData = await req.json();
    
    // Extract job parameters
    const { 
      marketId, 
      query, 
      maxIterations = 3, 
      focusText,
      notificationEmail 
    } = requestData;
    
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: marketId and query' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log(`Creating research job for market ${marketId} with query: ${query.substring(0, 50)}...`);
    console.log(`Parameters: maxIterations=${maxIterations}, focusText=${focusText || 'none'}, notification=${notificationEmail || 'none'}`);
    
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Create job record in the database
    const { data: jobData, error: jobError } = await supabase
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        user_id: requestData.userId, // Optional, might be null for anonymous research
        focus_text: focusText,
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: ["Job created, waiting to start..."],
        iterations: [],
        notification_email: notificationEmail
      })
      .select()
      .single();
      
    if (jobError) {
      console.error('Error creating job record:', jobError);
      throw new Error(`Failed to create job record: ${jobError.message}`);
    }
    
    const jobId = jobData.id;
    console.log(`Job created with ID: ${jobId}`);
    
    // Start processing the job in the background
    processJob(jobId, query, maxIterations, focusText).catch(error => {
      console.error(`Background job processing failed for job ${jobId}:`, error);
      // Update job status to failed
      supabase
        .rpc('update_research_job_status', { job_id: jobId, new_status: 'failed', error_msg: error.message || 'Unknown error' })
        .then(() => console.log(`Job ${jobId} marked as failed`))
        .catch(err => console.error(`Failed to update job status: ${err.message}`));
    });
    
    // Return success response with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Research job created successfully', 
        jobId 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error creating research job:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Process the research job in the background
async function processJob(jobId, query, maxIterations, focusText) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Update job status to processing
    await supabase.rpc('update_research_job_status', { 
      job_id: jobId, 
      new_status: 'processing' 
    });
    
    await appendProgressLog(jobId, "Starting background job processing...");
    
    // Add the focus text to the progress log if provided
    if (focusText) {
      await appendProgressLog(jobId, `Research focus area: ${focusText}`);
    }
    
    // Initialize context for the iterations
    let iterationContext = {
      previousQueries: [],
      previousResults: [],
      previousAnswers: []
    };
    
    // Run iterations
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Starting iteration ${i} of ${maxIterations} for job ${jobId}`);
      await appendProgressLog(jobId, `Starting iteration ${i} of ${maxIterations}...`);
      
      // Update current iteration in the job record
      await supabase
        .from('research_jobs')
        .update({ current_iteration: i })
        .eq('id', jobId);
      
      // Process this iteration
      const iterationResult = await processIteration(jobId, i, query, iterationContext, focusText);
      
      // Update the context for the next iteration
      iterationContext = {
        previousQueries: [...iterationContext.previousQueries, ...iterationResult.queries],
        previousResults: [...iterationContext.previousResults, ...iterationResult.results],
        previousAnswers: [...iterationContext.previousAnswers, iterationResult.analysis]
      };
    }
    
    // Perform final analysis and synthesis
    await appendProgressLog(jobId, "All iterations complete. Generating final analysis...");
    
    const finalResults = await generateFinalResults(jobId, maxIterations, query, iterationContext, focusText);
    
    // Update job with final results
    await supabase.rpc('update_research_results', {
      job_id: jobId,
      result_data: finalResults
    });
    
    // Mark job as completed
    await supabase.rpc('update_research_job_status', { 
      job_id: jobId, 
      new_status: 'completed' 
    });
    
    await appendProgressLog(jobId, "Job completed successfully!");
    
    // Check if we need to send a notification email
    const { data: job } = await supabase
      .from('research_jobs')
      .select('notification_email')
      .eq('id', jobId)
      .single();
      
    if (job?.notification_email) {
      await appendProgressLog(jobId, `Sending completion notification to ${job.notification_email}...`);
      
      try {
        await supabase.functions.invoke('send-research-notification', {
          body: { jobId, email: job.notification_email }
        });
        
        await appendProgressLog(jobId, "Notification email sent successfully");
      } catch (error) {
        console.error(`Error sending notification for job ${jobId}:`, error);
        await appendProgressLog(jobId, `Failed to send notification email: ${error.message}`);
      }
    }
    
    console.log(`Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    
    // Log the error in the progress log
    try {
      await appendProgressLog(jobId, `Error: ${error.message}`);
    } catch (logError) {
      console.error(`Failed to append error to progress log: ${logError.message}`);
    }
    
    // Update job status to failed
    try {
      await supabase.rpc('update_research_job_status', { 
        job_id: jobId, 
        new_status: 'failed', 
        error_msg: error.message || 'Unknown error' 
      });
    } catch (statusError) {
      console.error(`Failed to update job status: ${statusError.message}`);
    }
    
    throw error;
  }
}

// Append a message to the job's progress log
async function appendProgressLog(jobId, message) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    await supabase.rpc('append_progress_log', {
      job_id: jobId,
      log_message: message
    });
    console.log(`Job ${jobId} progress: ${message}`);
  } catch (error) {
    console.error(`Failed to append progress log for job ${jobId}:`, error);
  }
}

// Process a single iteration of research
async function processIteration(jobId, iterationNumber, originalQuery, context, focusText) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Step 1: Generate search queries based on original query and previous answers
    await appendProgressLog(jobId, `Generating search queries for iteration ${iterationNumber}...`);
    
    const queries = await generateSearchQueries(originalQuery, context, iterationNumber, focusText);
    await appendProgressLog(jobId, `Generated ${queries.length} search queries`);
    
    // Create the iteration object with initial data
    const iterationData = {
      iteration: iterationNumber,
      queries: queries,
      results: [],
      analysis: "",
      reasoning: "",
    };
    
    // Add the iteration to the job record
    await supabase.rpc('append_research_iteration', {
      job_id: jobId,
      iteration_data: JSON.stringify(iterationData)
    });
    
    // Step 2: For each query, search for information
    await appendProgressLog(jobId, `Searching for information using ${queries.length} queries...`);
    
    let allResults = [];
    for (const query of queries) {
      await appendProgressLog(jobId, `Searching for: "${query}"`);
      
      // This implements a retry mechanism with exponential backoff for search
      const searchResultsWithRetry = await backOff(() => webSearch(query), {
        numOfAttempts: 3,
        startingDelay: 1000,
        timeMultiple: 2,
        retry: (e, attemptNumber) => {
          console.error(`Search attempt ${attemptNumber} failed for query "${query}":`, e);
          return true; // Always retry
        }
      });
      
      allResults = [...allResults, ...searchResultsWithRetry];
      
      // Update the iteration with new results
      const updatedIteration = {
        ...iterationData,
        results: allResults
      };
      
      // Replace the iteration in the job record
      await updateIterationInJob(jobId, iterationNumber, updatedIteration);
    }
    
    // De-duplicate results by URL
    const uniqueResults = [];
    const seenUrls = new Set();
    for (const result of allResults) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        uniqueResults.push(result);
      }
    }
    
    await appendProgressLog(jobId, `Found ${uniqueResults.length} unique search results`);
    
    // Step 3: Analyze the search results and generate an answer
    await appendProgressLog(jobId, `Analyzing search results for iteration ${iterationNumber}...`);
    
    // First, ensure the iteration has the latest data
    const currentIteration = {
      ...iterationData,
      results: uniqueResults
    };
    
    // Start the analysis and reasoning stream
    const analysisStream = await startAnalysisStream(originalQuery, uniqueResults, context, iterationNumber, maxIterations, focusText);
    
    if (!analysisStream.ok) {
      throw new Error(`Failed to start analysis stream: ${analysisStream.status} ${analysisStream.statusText}`);
    }
    
    // Process the analysis stream
    const reader = analysisStream.body.getReader();
    let analysisText = "";
    let reasoningText = "";
    let isInReasoning = false;
    let streamCompleted = false;
    let accumulatedChunk = "";
    let idleCount = 0;
    const MAX_IDLE_ATTEMPTS = 5;

    while (!streamCompleted) {
      try {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`Stream complete for iteration ${iterationNumber}`);
          streamCompleted = true;
          break;
        }
        
        // Decode and process the chunk
        const chunkText = new TextDecoder().decode(value);
        accumulatedChunk += chunkText;
        
        // Look for complete SSE messages ending with double newlines
        const messages = accumulatedChunk.split('\n\n');
        accumulatedChunk = messages.pop() || ''; // Keep the last partial message if any
        
        if (messages.length === 0) {
          idleCount++;
          if (idleCount >= MAX_IDLE_ATTEMPTS) {
            console.log(`No complete messages after ${MAX_IDLE_ATTEMPTS} attempts, processing accumulated chunk: ${accumulatedChunk.substring(0, 100)}...`);
            // Try to process any accumulated partial data
            processMessage(accumulatedChunk);
            accumulatedChunk = "";
            idleCount = 0;
          }
          continue;
        }
        
        idleCount = 0; // Reset idle counter when we get messages
        
        for (const message of messages) {
          processMessage(message);
        }
      } catch (error) {
        console.error(`Error processing analysis stream for iteration ${iterationNumber}:`, error);
        await appendProgressLog(jobId, `Error processing analysis: ${error.message}`);
        break;
      }
    }
    
    function processMessage(message) {
      if (!message.trim()) return;
      
      if (!message.startsWith('data: ')) {
        console.log(`Unrecognized message format: ${message.substring(0, 100)}...`);
        return;
      }
      
      const content = message.slice(6).trim(); // Remove 'data: ' prefix
      
      if (content === '[DONE]') {
        console.log(`Received [DONE] marker for iteration ${iterationNumber}`);
        streamCompleted = true;
        return;
      }
      
      try {
        const jsonData = JSON.parse(content);
        const delta = jsonData.choices?.[0]?.delta;
        
        if (delta?.content) {
          const textChunk = delta.content;
          
          // Check for reasoning section marker
          if (textChunk.includes("### Reasoning:")) {
            isInReasoning = true;
            const parts = textChunk.split("### Reasoning:");
            analysisText += parts[0];
            reasoningText += parts[1] || "";
          } else if (isInReasoning) {
            reasoningText += textChunk;
          } else {
            analysisText += textChunk;
          }
          
          // Update the iteration with the latest analysis and reasoning
          const updatedIteration = {
            ...currentIteration,
            analysis: analysisText.trim(),
            reasoning: reasoningText.trim()
          };
          
          // Update the iteration in the job record
          updateIterationInJob(jobId, iterationNumber, updatedIteration);
        } else if (delta?.deltaReasoning) {
          // Handle the case where the model might send reasoning in a separate delta field
          reasoningText += delta.deltaReasoning;
          
          // Update just the reasoning in the job record
          const updatedIteration = {
            ...currentIteration,
            reasoning: reasoningText.trim()
          };
          
          updateIterationInJob(jobId, iterationNumber, updatedIteration);
        }
      } catch (error) {
        console.debug(`Error parsing message for iteration ${iterationNumber}: ${error.message}`);
        console.debug(`Problematic message: ${message.substring(0, 100)}...`);
        // Try to extract content without parsing JSON
        if (message.includes("content")) {
          const contentMatch = message.match(/"content"\s*:\s*"([^"]*)"/);
          if (contentMatch && contentMatch[1]) {
            const textChunk = contentMatch[1];
            analysisText += textChunk;
          }
        }
      }
    }
    
    // Ensure we have the final analysis after the stream completes
    // In case the streaming didn't fully complete
    await appendProgressLog(jobId, `Completed analysis for iteration ${iterationNumber}`);
    
    // Log analysis and reasoning lengths for debugging
    console.log(`Iteration ${iterationNumber} complete - Analysis: ${analysisText.length} chars, Reasoning: ${reasoningText.length} chars`);
    
    // Final update to ensure complete data
    const finalIterationData = {
      iteration: iterationNumber,
      queries: queries,
      results: uniqueResults,
      analysis: analysisText.trim() || "Analysis generation incomplete",
      reasoning: reasoningText.trim() || "Reasoning generation incomplete"
    };
    
    // Update one last time
    await updateIterationInJob(jobId, iterationNumber, finalIterationData);
    
    // Return the iteration data for context in the next iteration
    return finalIterationData;
    
  } catch (error) {
    console.error(`Error in iteration ${iterationNumber} for job ${jobId}:`, error);
    await appendProgressLog(jobId, `Error in iteration ${iterationNumber}: ${error.message}`);
    throw error;
  }
}

// Update a specific iteration in the job record
async function updateIterationInJob(jobId, iterationNumber, iterationData) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Get current iterations
    const { data: job, error } = await supabase
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
      
    if (error) {
      console.error(`Error fetching job ${jobId} iterations:`, error);
      return;
    }
    
    // Update the specific iteration
    const iterations = job.iterations || [];
    const updatedIterations = [...iterations];
    
    // Find the index of the iteration
    const index = updatedIterations.findIndex(it => it.iteration === iterationNumber);
    
    if (index !== -1) {
      updatedIterations[index] = iterationData;
    } else {
      updatedIterations.push(iterationData);
    }
    
    // Update the job with the new iterations
    await supabase
      .from('research_jobs')
      .update({ iterations: updatedIterations })
      .eq('id', jobId);
      
    console.log(`Successfully updated iteration ${iterationNumber} with ${iterationData.analysis.length} analysis chars and ${iterationData.reasoning.length} reasoning chars`);
    
  } catch (error) {
    console.error(`Error updating iteration ${iterationNumber} for job ${jobId}:`, error);
  }
}

// Generate search queries based on the original query and previous answers
async function generateSearchQueries(originalQuery, context, iterationNumber, focusText) {
  try {
    // For first iteration, just use variations of the original query
    if (iterationNumber === 1) {
      if (focusText) {
        return [
          `${originalQuery} ${focusText}`,
          `${focusText} detailed explanation`,
          `${originalQuery} analysis evidence`,
          `${focusText} statistics data`
        ];
      } else {
        return [
          originalQuery,
          `${originalQuery} detailed explanation`,
          `${originalQuery} analysis`,
          `${originalQuery} evidence statistics`
        ];
      }
    }
    
    // For subsequent iterations, use more targeted queries based on previous findings
    const systemPrompt = `
      You are a research assistant helping to explore a complex question.
      Based on the original query and previous findings, generate 3-5 specific search queries
      that will help gather additional information to answer the question.
      Focus on specific details, evidence, counterarguments, and data points.
      Return ONLY the list of search queries, one per line.
    `;
    
    const previousAnswers = context.previousAnswers.join("\n\n");
    const previousQueries = context.previousQueries.join(", ");
    
    const userPrompt = `
      Original Question: ${originalQuery}
      ${focusText ? `Focus Area: ${focusText}` : ''}
      Previous Queries: ${previousQueries}
      Previous Research Findings:
      ${previousAnswers}
      
      Generate 3-5 new search queries to find additional information not covered in previous research.
      Specifically look for evidence, statistics, or alternate perspectives.
    `;
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to generate search queries: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const generatedText = data.choices[0].message.content;
    
    // Parse the generated text into individual queries
    const queries = generatedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('Query') && !line.startsWith('#'));
    
    // Always ensure we have at least the original query as a fallback
    if (queries.length === 0) {
      if (focusText) {
        return [`${originalQuery} ${focusText}`, focusText];
      } else {
        return [originalQuery];
      }
    }
    
    return queries.slice(0, 5); // Limit to 5 queries maximum
  } catch (error) {
    console.error("Error generating search queries:", error);
    // Fallback to basic queries
    if (focusText) {
      return [`${originalQuery} ${focusText}`, focusText];
    } else {
      return [originalQuery];
    }
  }
}

// Perform web search using Brave or another search API
async function webSearch(query) {
  try {
    // Use Brave Search API
    const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY');
    
    if (!BRAVE_API_KEY) {
      throw new Error("Brave API key is not configured");
    }
    
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Transform Brave's response into our standard format
    return (data.web?.results || []).map(result => ({
      title: result.title,
      url: result.url,
      content: result.description
    }));
  } catch (error) {
    console.error(`Web search error for query "${query}":`, error);
    
    // Fallback to Bing if Brave fails
    try {
      return await bingSearch(query);
    } catch (bingError) {
      console.error(`Bing fallback search also failed:`, bingError);
      return []; // Return empty results if all search methods fail
    }
  }
}

// Fallback search using Bing
async function bingSearch(query) {
  try {
    const BING_API_KEY = Deno.env.get('BING_API_KEY');
    
    if (!BING_API_KEY) {
      throw new Error("Bing API key is not configured");
    }
    
    const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: {
        'Ocp-Apim-Subscription-Key': BING_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Bing search failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Transform Bing's response into our standard format
    return (data.webPages?.value || []).map(result => ({
      title: result.name,
      url: result.url,
      content: result.snippet
    }));
  } catch (error) {
    console.error(`Bing search error for query "${query}":`, error);
    return []; // Return empty results if Bing search fails
  }
}

// Start the analysis stream
async function startAnalysisStream(query, results, context, iterationNumber, maxIterations, focusText) {
  try {
    const systemPrompt = `
      You are a research assistant analyzing search results to answer a question.
      Your task is to analyze the search results and extract key information relevant to the question.
      Present your analysis in a well-structured format.
      
      Your response MUST be structured in two distinct sections:
      1. First, provide your analysis with key findings and insights.
      2. Then, include a section with "### Reasoning:" that explains your thought process.
      
      Keep your analysis concise and focused on the most important information.
    `;
    
    // Prepare summary of all search results
    const formattedResults = results.map((result, i) => (
      `[${i+1}] "${result.title}"
      URL: ${result.url}
      ${result.content}`
    )).join('\n\n');
    
    // Prepare context from previous iterations
    let contextInfo = "";
    if (context.previousAnswers.length > 0) {
      contextInfo = `
        Previous iteration findings:
        ${context.previousAnswers.map((answer, i) => `Iteration ${i+1}: ${answer.substring(0, 300)}...`).join('\n\n')}
      `;
    }
    
    const userPrompt = `
      Question: ${query}
      ${focusText ? `Focus Area: ${focusText}` : ''}
      
      Current iteration: ${iterationNumber} of ${maxIterations}
      
      ${contextInfo}
      
      Search Results:
      ${formattedResults}
      
      Analyze these search results to help answer the question. Focus on:
      1. Key facts and evidence
      2. Different perspectives
      3. Data points and statistics
      4. Limitations in current information
      
      First provide your analysis, then include a "### Reasoning:" section that explains your thought process.
    `;
    
    // Use OpenRouter to access various LLM models
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-opus-20240229",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        stream: true
      })
    });
    
    return response;
  } catch (error) {
    console.error("Error starting analysis stream:", error);
    throw error;
  }
}

// Generate final results after all iterations are complete
async function generateFinalResults(jobId, maxIterations, query, context, focusText) {
  try {
    await appendProgressLog(jobId, "Generating final analysis and insights...");
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get all iterations from the job
    const { data: job, error } = await supabase
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
      
    if (error) {
      throw new Error(`Failed to get job iterations: ${error.message}`);
    }
    
    const iterations = job.iterations || [];
    
    // Collect all unique search results across all iterations
    const allResults = [];
    const seenUrls = new Set();
    
    for (const iteration of iterations) {
      for (const result of (iteration.results || [])) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }
    }
    
    // Collect all analyses from iterations
    const allAnalyses = iterations
      .filter(it => it.analysis)
      .map(it => `Iteration ${it.iteration}: ${it.analysis}`);
    
    // Generate the final analysis
    const systemPrompt = `
      You are a research assistant providing a final analysis after multiple iterations of research.
      Synthesize the findings from all iterations into a comprehensive answer to the original question.
      Your final report should be well-structured, evidence-based, and include:
      
      1. A comprehensive analysis addressing the question
      2. Key evidence and data points from the research
      3. Different perspectives if relevant
      4. Structured insights that can be easily parsed
    `;
    
    const userPrompt = `
      Original Question: ${query}
      ${focusText ? `Focus Area: ${focusText}` : ''}
      
      Research Iterations (${iterations.length}):
      ${allAnalyses.join('\n\n')}
      
      Based on the research across all iterations, provide:
      
      1. A comprehensive analysis that addresses the original question
      2. A structured assessment of probability (express as a percentage) if this is a forecasting question
      3. Areas that need further research
      
      Format your response as structured sections.
    `;
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-opus-20240229",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to generate final analysis: ${response.status} ${response.statusText}`);
    }
    
    const analysisResponse = await response.json();
    const finalAnalysis = analysisResponse.choices[0].message.content;
    
    // Extract structured insights
    const structuredInsights = await extractStructuredInsights(finalAnalysis, query);
    
    return {
      data: allResults,
      analysis: finalAnalysis,
      structuredInsights
    };
  } catch (error) {
    console.error("Error generating final results:", error);
    throw error;
  }
}

// Extract structured insights from the final analysis
async function extractStructuredInsights(analysis, query) {
  try {
    const systemPrompt = `
      You are a research assistant extracting structured insights from a final analysis.
      Extract key information in a specific JSON format with these fields:
      - probability: a percentage if this is a forecasting question (e.g., "65%")
      - areasForResearch: an array of specific topics needing more research
      Return only the JSON object, nothing else.
    `;
    
    const userPrompt = `
      Original Question: ${query}
      
      Analysis to process:
      ${analysis}
      
      Extract the probability assessment (if present) and areas needing more research.
      Return as JSON with 'probability' and 'areasForResearch' fields.
    `;
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to extract insights: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const jsonStr = data.choices[0].message.content;
    
    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Error parsing structured insights:", parseError);
      return {
        probability: null,
        areasForResearch: []
      };
    }
  } catch (error) {
    console.error("Error extracting structured insights:", error);
    return {
      probability: null,
      areasForResearch: []
    };
  }
}
