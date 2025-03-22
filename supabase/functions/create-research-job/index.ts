
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface StreamMessage {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: {
    index?: number;
    delta?: {
      content?: string;
      role?: string;
      reasoning?: string;  // This might not always be present
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const BRAVE_SEARCH_URL = "https://lfmkoismabbhujycnqpn.functions.supabase.co/brave-search";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Use the correct createClient implementation with options parameter
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, maxIterations = 3, user_id, market_id } = await req.json();

    if (!query || typeof query !== "string") {
      throw new Error("Invalid or missing query parameter");
    }

    // Create a research job in the database
    const { data: job, error: jobError } = await supabase
      .from("research_jobs")
      .insert([
        {
          query,
          status: "queued",
          max_iterations: maxIterations,
          current_iteration: 0,
          progress_log: [],
          iterations: [],
          user_id,
          market_id,
        },
      ])
      .select()
      .single();

    if (jobError) {
      console.error("Error creating job:", jobError);
      throw new Error(`Failed to create research job: ${jobError.message}`);
    }

    // Start a background process to handle the research
    processResearch(job.id, query, maxIterations).catch((error) => {
      console.error(`Error in background process for job ${job.id}:`, error);
      updateJobStatus(job.id, "failed", error.message).catch(console.error);
    });

    return new Response(JSON.stringify({ jobId: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "An unknown error occurred",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processResearch(jobId, initialQuery, maxIterations) {
  try {
    await updateJobStatus(jobId, "processing");
    await appendProgressLog(jobId, "Starting research process...");

    // For the initial iteration
    await appendProgressLog(jobId, `Processing initial query: ${initialQuery}`);
    
    let currentIteration = 0;
    
    while (currentIteration < maxIterations) {
      currentIteration++;
      
      // Update the job with the current iteration number
      await supabase
        .from("research_jobs")
        .update({ current_iteration: currentIteration })
        .eq("id", jobId);
      
      // Get the query to use (initial query for the first iteration, or generate new queries for later iterations)
      let queries = [];
      
      if (currentIteration === 1) {
        // Use the initial query for the first iteration
        queries = [initialQuery];
      } else {
        // For subsequent iterations, we would generate new queries based on previous results
        // This is a placeholder - in a real implementation you'd have logic to generate new queries
        await appendProgressLog(jobId, "Generating follow-up queries...");
        
        // Call an API or use a model to generate new queries based on previous results
        queries = await generateQueriesForIteration(jobId, currentIteration);
      }
      
      await appendProgressLog(jobId, `Iteration ${currentIteration}: Searching for ${queries.length} queries...`);
      
      // Execute the search for each query
      let allResults = [];
      
      for (const query of queries) {
        await appendProgressLog(jobId, `Searching for: "${query}"`);
        
        // Execute search
        const searchResults = await executeSearch(query);
        
        if (searchResults.length > 0) {
          await appendProgressLog(jobId, `Found ${searchResults.length} results for query "${query}"`);
          allResults = [...allResults, ...searchResults];
        } else {
          await appendProgressLog(jobId, `No results found for query "${query}"`);
        }
      }
      
      // Deduplicate results
      const uniqueUrls = new Set();
      allResults = allResults.filter(result => {
        if (uniqueUrls.has(result.url)) {
          return false;
        }
        uniqueUrls.add(result.url);
        return true;
      });
      
      await appendProgressLog(jobId, `Retrieved ${allResults.length} unique results for iteration ${currentIteration}`);
      
      // Generate analysis based on the search results
      await appendProgressLog(jobId, "Generating analysis based on search results...");
      
      const { analysis, reasoning } = await generateAnalysisWithStreaming(jobId, currentIteration, allResults, queries, initialQuery);
      
      // Store the iteration results
      const iterationData = {
        iteration: currentIteration,
        queries,
        results: allResults,
        analysis,
        reasoning
      };
      
      await appendProgressLog(jobId, `Completed iteration ${currentIteration} analysis`);
      
      // Append the iteration data to the job
      await supabase.rpc("append_research_iteration", {
        job_id: jobId,
        iteration_data: iterationData
      });
      
      // Check if we've reached the final iteration
      if (currentIteration >= maxIterations) {
        await appendProgressLog(jobId, "Reached maximum iterations, finalizing research...");
        await updateJobStatus(jobId, "completed");
        break;
      }
    }
  } catch (error) {
    console.error(`Error in research process for job ${jobId}:`, error);
    await appendProgressLog(jobId, `Error: ${error.message}`);
    await updateJobStatus(jobId, "failed", error.message);
  }
}

async function executeSearch(query) {
  try {
    const response = await fetch(BRAVE_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search API error (${response.status}): ${errorText}`);
    }

    const searchData = await response.json();
    return searchData.results || [];
  } catch (error) {
    console.error("Search execution error:", error);
    return [];
  }
}

async function generateQueriesForIteration(jobId, currentIteration) {
  // Get previous iterations
  const { data: job } = await supabase
    .from("research_jobs")
    .select("iterations, query")
    .eq("id", jobId)
    .single();

  if (!job || !job.iterations || job.iterations.length === 0) {
    // If no previous iterations, use a default approach
    return [`More information about ${job.query}`];
  }

  // Get the last iteration
  const lastIteration = job.iterations[job.iterations.length - 1];
  
  // Simple logic to generate follow-up queries (in a real app, this would be more sophisticated)
  const followUpQueries = [
    `Latest developments regarding ${job.query}`,
    `Expert analysis on ${job.query}`,
    `Alternative perspectives on ${job.query}`
  ];
  
  return followUpQueries;
}

async function generateAnalysisWithStreaming(jobId, iteration, results, queries, originalQuery) {
  let analysisContent = "";
  let reasoningContent = "";
  let chunkSequence = 0;

  try {
    // Prepare the prompt for the analysis
    const prompt = `
Generate a thorough analysis of the following search results related to the query: "${originalQuery}".

SEARCH QUERIES:
${queries.map(q => `- ${q}`).join('\n')}

SEARCH RESULTS:
${results.map(r => `- ${r.title}: ${r.url}
  ${r.description}`).join('\n\n')}

Provide a detailed analysis that:
1. Synthesizes the key information from the search results
2. Identifies main themes and perspectives
3. Notes any contradictions or gaps in the information
4. Evaluates the credibility and relevance of the sources

First, provide your reasoning process, then your final analysis.
`;

    // Stream the analysis from OpenRouter
    const streamResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://anyhunch.com",
        "X-Title": "Any Hunch Research",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-coder",
        stream: true,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      throw new Error(`Analysis generation error (${streamResponse.status}): ${errorText}`);
    }

    await appendProgressLog(jobId, "Analysis streaming started...");

    // Process the stream
    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error("Stream reader could not be initialized");
    }

    console.log("Starting to process stream...");
    const { analysisResult, reasoningResult } = await processStream(reader, jobId, iteration, chunkSequence);
    analysisContent = analysisResult || "";
    reasoningContent = reasoningResult || "";
    console.log("Stream processing complete");

    await appendProgressLog(jobId, "Analysis streaming completed");
  } catch (error) {
    console.error("Error generating analysis:", error);
    await appendProgressLog(jobId, `Analysis error: ${error.message}`);
    // Return partial results if we have any
    return { 
      analysis: analysisContent || "Error generating analysis.", 
      reasoning: reasoningContent || "Error processing reasoning." 
    };
  }

  return { analysis: analysisContent, reasoning: reasoningContent };
}

async function processStream(reader, jobId, iteration, startSequence) {
  let done = false;
  let sequence = startSequence;
  let decoder = new TextDecoder();
  let analysisText = "";
  let reasoningText = "";
  let buffer = "";
  
  // Track if we've seen content that should be considered as analysis
  let hasStartedContent = false;
  let streamComplete = false;

  while (!done && !streamComplete) {
    try {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      
      if (done) {
        console.log("Stream marked as done by reader");
        streamComplete = true;
        continue;
      }
      
      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete chunks
      const lines = buffer.split('\n');
      buffer = lines.pop() || ""; // Keep the last incomplete chunk in the buffer
      
      for (const line of lines) {
        if (line.trim() === "" || line.includes("[DONE]")) {
          if (line.includes("[DONE]")) {
            console.log("Found [DONE] marker in stream");
            streamComplete = true;
          }
          continue;
        }
        
        // Remove "data: " prefix if it exists
        const jsonStr = line.startsWith("data: ") ? line.slice(5) : line;
        
        try {
          const chunk = JSON.parse(jsonStr) as StreamMessage;
          
          // Extract content from the chunk
          if (chunk.choices && chunk.choices.length > 0) {
            const delta = chunk.choices[0].delta;
            
            // Check for finish reason which indicates the end of the stream
            if (chunk.choices[0].finish_reason) {
              console.log(`Stream finished with reason: ${chunk.choices[0].finish_reason}`);
              streamComplete = true;
            }
            
            // Extract content (most reliable field)
            if (delta?.content) {
              hasStartedContent = true;
              analysisText += delta.content;
              
              // Store chunk to database
              await supabase.rpc("append_analysis_chunk", {
                job_id: jobId,
                iteration: iteration,
                chunk: delta.content,
                seq: sequence++
              });
            }
            
            // Extract reasoning if available
            if (delta?.reasoning) {
              reasoningText += delta.reasoning;
            }
          }
        } catch (e) {
          console.warn(`Failed to parse JSON from stream chunk: ${e.message}`);
          // Continue processing other chunks even if one fails
        }
      }
    } catch (error) {
      console.error("Error processing stream chunk:", error);
      break;
    }
  }
  
  // Process any remaining content in the buffer
  if (buffer.trim()) {
    try {
      if (buffer.startsWith("data: ")) {
        buffer = buffer.slice(5);
      }
      
      const chunk = JSON.parse(buffer) as StreamMessage;
      
      if (chunk.choices && chunk.choices.length > 0) {
        const delta = chunk.choices[0].delta;
        
        if (delta?.content) {
          analysisText += delta.content;
          
          await supabase.rpc("append_analysis_chunk", {
            job_id: jobId,
            iteration: iteration,
            chunk: delta.content,
            seq: sequence++
          });
        }
        
        if (delta?.reasoning) {
          reasoningText += delta.reasoning;
        }
      }
    } catch (e) {
      console.warn(`Failed to parse final JSON chunk: ${e.message}`);
    }
  }
  
  // If we haven't seen any reasoning content but have analysis content,
  // this model might not support separate reasoning fields
  if (reasoningText === "" && analysisText !== "") {
    // Split the content between reasoning and analysis (using a simple heuristic)
    // In a real app, you might use a more sophisticated approach
    const parts = analysisText.split(/(?:^|\n)(?:Analysis|Final Analysis|Summary):/i, 2);
    if (parts.length > 1) {
      reasoningText = parts[0].trim();
      analysisText = parts[1].trim();
    } else {
      // If we can't split it, just put everything in analysis
      reasoningText = "See analysis for combined content.";
    }
  }
  
  console.log(`Stream processing complete. Analysis: ${analysisText.length} chars, Reasoning: ${reasoningText.length} chars`);
  
  return { 
    analysisResult: analysisText, 
    reasoningResult: reasoningText 
  };
}

async function updateJobStatus(jobId, status, errorMessage = null) {
  try {
    await supabase.rpc("update_research_job_status", {
      job_id: jobId,
      new_status: status,
      error_msg: errorMessage
    });
  } catch (error) {
    console.error(`Failed to update job ${jobId} status to ${status}:`, error);
  }
}

async function appendProgressLog(jobId, message) {
  try {
    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: message
    });
    console.log(`[Job ${jobId}] ${message}`);
  } catch (error) {
    console.error(`Failed to append log to job ${jobId}:`, error);
  }
}
