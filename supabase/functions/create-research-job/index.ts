import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Define constants
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create a Supabase client with the Admin key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createResearchJob(
  marketId: string,
  query: string,
  maxIterations: number = 3,
  userId?: string,
  focusText?: string,
  notificationEmail?: string
) {
  try {
    console.log(`Creating research job for market ${marketId} with query: "${query}"`);
    console.log(`Iterations: ${maxIterations}, User: ${userId || 'anonymous'}, Focus: ${focusText || 'none'}, Email: ${notificationEmail || 'none'}`);

    // Create the job record
    const { data: job, error } = await supabaseAdmin
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query,
        status: 'queued',
        max_iterations: maxIterations,
        user_id: userId || null,
        focus_text: focusText || null,
        notification_email: notificationEmail || null,
        progress_log: ['Job created, waiting to start...']
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating research job:', error);
      throw new Error(`Failed to create research job: ${error.message}`);
    }

    console.log(`Research job created with ID: ${job.id}`);

    // Start the job processing in the background
    processJobInBackground(job.id).catch(err => {
      console.error(`Background job processing error for job ${job.id}:`, err);
    });

    return job;
  } catch (error) {
    console.error('Error in createResearchJob:', error);
    throw error;
  }
}

async function processJobInBackground(jobId: string) {
  try {
    console.log(`Starting background processing for job: ${jobId}`);

    // Update job status to 'processing'
    const { data: job, error: jobError } = await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: ['Background processing started...'],
          field: 'progress_log',
          table_name: 'research_jobs',
          row_id: jobId
        })
      })
      .eq('id', jobId)
      .select()
      .single();

    if (jobError || !job) {
      console.error(`Error updating job ${jobId} to processing status:`, jobError);
      throw new Error(`Failed to update job status: ${jobError?.message}`);
    }

    // Execute the job processing logic
    await executeResearchJob(job);

    console.log(`Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);

    // Update job status to 'failed'
    try {
      await supabaseAdmin
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error',
          progress_log: supabaseAdmin.rpc('append_to_array', {
            arr: [`Job failed: ${error.message || 'Unknown error'}`],
            field: 'progress_log',
            table_name: 'research_jobs',
            row_id: jobId
          })
        })
        .eq('id', jobId);
    } catch (updateError) {
      console.error(`Failed to update job ${jobId} failure status:`, updateError);
    }
  }
}

async function executeResearchJob(job: any) {
  try {
    // Get the initial parameters from the job
    const { id: jobId, market_id: marketId, query, max_iterations: maxIterations, focus_text: focusText } = job;

    // Log the query we're processing
    console.log(`Processing job ${jobId} with query: "${query}" for market ${marketId}`);
    console.log(`Max iterations: ${maxIterations}, Focus text: ${focusText || 'none'}`);

    // Initialize results
    let sources: any[] = [];
    let analysis = '';
    let structuredInsights = null;

    // Add progress log entry
    await updateJobProgress(jobId, [`Starting research for "${query}"`]);

    // For each iteration (1-based for UI display)
    for (let i = 1; i <= maxIterations; i++) {
      // Update current iteration in the database
      await supabaseAdmin
        .from('research_jobs')
        .update({ current_iteration: i })
        .eq('id', jobId);

      console.log(`Starting iteration ${i} of ${maxIterations} for job ${jobId}`);
      await updateJobProgress(jobId, [`Starting iteration ${i} of ${maxIterations}`]);

      try {
        // Determine the search query for this iteration
        const searchQuery = i === 1 
          ? (focusText ? `${query} ${focusText}` : query)
          : await generateSearchQuery(query, sources, i, jobId, focusText);

        // Search for information
        await updateJobProgress(jobId, [`Iteration ${i}: Searching for "${searchQuery}"`]);
        const searchResults = await searchForInformation(searchQuery, jobId, i);
        
        if (!searchResults || searchResults.length === 0) {
          await updateJobProgress(jobId, [`Iteration ${i}: No search results found`]);
          continue;
        }

        await updateJobProgress(jobId, [
          `Iteration ${i}: Found ${searchResults.length} sources of information`,
          `Iteration ${i}: Analyzing collected information...`
        ]);

        // Add these sources to our collection
        sources = [...sources, ...searchResults];

        // Analyze the information found so far
        const iterationResults = await generateAnalysisWithStreaming(sources, query, i, jobId, focusText);
        analysis = iterationResults.analysis;

        // If we're on the last iteration, generate structured insights
        if (i === maxIterations) {
          await updateJobProgress(jobId, [`Final iteration complete. Generating structured insights...`]);
          
          structuredInsights = await extractStructuredInsights(sources, query, analysis, jobId);
          
          await updateJobProgress(jobId, [`Structured insights generated`]);
        }
      } catch (iterationError) {
        console.error(`Error in iteration ${i} for job ${jobId}:`, iterationError);
        await updateJobProgress(jobId, [`Error in iteration ${i}: ${iterationError.message}`]);
        
        // Continue to the next iteration if there's an error
        continue;
      }
    }

    // Finalize the job
    const resultsObject = {
      data: sources,
      analysis,
      structuredInsights
    };

    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: resultsObject,
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: ['Research job completed successfully'],
          field: 'progress_log',
          table_name: 'research_jobs',
          row_id: jobId
        })
      })
      .eq('id', jobId);

    // Call the notification function
    try {
      const { data: jobData } = await supabaseAdmin
        .from('research_jobs')
        .select('notification_email')
        .eq('id', jobId)
        .single();

      if (jobData?.notification_email) {
        await supabaseAdmin.functions.invoke('send-research-notification', {
          body: { jobId }
        });
      }
    } catch (notificationError) {
      console.error(`Error sending notification for job ${jobId}:`, notificationError);
    }

    console.log(`Job ${jobId} processing completed with ${sources.length} sources`);
  } catch (error) {
    console.error(`Error executing research job ${job.id}:`, error);
    throw error;
  }
}

async function updateJobProgress(jobId: string, messages: string[]) {
  if (!messages || messages.length === 0) return;

  try {
    await supabaseAdmin
      .from('research_jobs')
      .update({
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: messages,
          field: 'progress_log',
          table_name: 'research_jobs',
          row_id: jobId
        }),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  } catch (error) {
    console.error(`Error updating progress for job ${jobId}:`, error);
  }
}

async function searchForInformation(query: string, jobId: string, iteration: number) {
  try {
    console.log(`Searching for information with query: "${query}"`);

    // Call the Brave search API via an edge function
    const { data, error } = await supabaseAdmin.functions.invoke('brave-search', {
      body: { query }
    });

    if (error) {
      console.error('Error calling brave-search:', error);
      throw new Error(`Search API error: ${error.message}`);
    }

    if (!data || !Array.isArray(data.results)) {
      console.warn('No results found or invalid response format');
      return [];
    }

    console.log(`Search returned ${data.results.length} results`);

    // For each result, scrape the content
    const scrapingPromises = data.results.map(async (result: any) => {
      try {
        // Sometimes the URL in the API response is not the canonical URL
        const url = result.url;

        await updateJobProgress(jobId, [`Iteration ${iteration}: Scraping content from ${url}`]);
        
        const { data: scrapeData, error: scrapeError } = await supabaseAdmin.functions.invoke('web-scrape', {
          body: { url }
        });

        if (scrapeError) {
          console.error(`Error scraping ${url}:`, scrapeError);
          return null;
        }

        return {
          url,
          title: result.title || scrapeData?.title || '',
          content: scrapeData?.content || result.description || '',
        };
      } catch (scrapeError) {
        console.error(`Error processing search result:`, scrapeError);
        return null;
      }
    });

    // Wait for all scraping to complete
    const scrapedResults = await Promise.all(scrapingPromises);
    
    // Filter out null results and ensure content is not empty
    const validResults = scrapedResults.filter(result => 
      result !== null && 
      result.content && 
      result.content.trim() !== ''
    );

    console.log(`Successfully scraped ${validResults.length} valid results`);
    return validResults;
  } catch (error) {
    console.error('Error in searchForInformation:', error);
    throw error;
  }
}

async function generateSearchQuery(originalQuery: string, existingSources: any[], iteration: number, jobId: string, focusText?: string) {
  try {
    console.log(`Generating search query for iteration ${iteration} based on ${existingSources.length} existing sources`);

    const sourcesText = existingSources
      .map(source => `URL: ${source.url}\nTitle: ${source.title || 'No title'}\nContent: ${truncateText(source.content, 500)}`)
      .join('\n\n')
      .slice(0, 8000); // Limit total sources text

    const prompt = `
      I'm researching the following topic: ${originalQuery}
      
      ${focusText ? `I'm particularly interested in: ${focusText}` : ''}
      
      Based on the information I've already collected:
      ${sourcesText || 'No information collected yet.'}
      
      Please generate a search query for my next research iteration that will help me find new, relevant information that I haven't already discovered. 
      The query should be focused and specific, designed to uncover different aspects of the topic or fill in gaps in the existing research.
      
      Return ONLY the search query text, nothing else.
    `;

    await updateJobProgress(jobId, [`Iteration ${iteration}: Generating focused search query`]);

    const { data, error } = await supabaseAdmin.functions.invoke('generate-queries', {
      body: { prompt }
    });

    if (error) {
      console.error('Error generating search query:', error);
      throw new Error(`Failed to generate search query: ${error.message}`);
    }

    let searchQuery = data?.query || originalQuery;
    
    // If we get back an empty query or the same as the original, use a fallback approach
    if (!searchQuery || searchQuery === originalQuery) {
      const fallbackKeywords = ['latest', 'recent developments', 'analysis', 'expert opinion', 'statistics'];
      searchQuery = `${originalQuery} ${fallbackKeywords[iteration % fallbackKeywords.length]}`;
    }

    // If we have focus text, incorporate it occasionally to keep searches relevant
    if (focusText && Math.random() > 0.5) {
      searchQuery = `${searchQuery} ${focusText}`;
    }

    console.log(`Generated search query for iteration ${iteration}: "${searchQuery}"`);
    await updateJobProgress(jobId, [`Iteration ${iteration}: Using search query "${searchQuery}"`]);
    
    return searchQuery;
  } catch (error) {
    console.error('Error in generateSearchQuery:', error);
    // Fallback to original query with iteration number
    return `${originalQuery} latest information ${iteration}`;
  }
}

async function generateAnalysisWithStreaming(sources: any[], query: string, iteration: number, jobId: string, focusText?: string) {
  // Initialize aggregation variables
  let analysisContent = '';
  let reasoningContent = '';
  let streamComplete = false;
  let lastChunkTime = Date.now();
  const streamTimeout = 60000; // 60 seconds timeout
  let stallDetected = false;
  const chunkBuffer = [];
  
  console.log(`Starting analysis generation with streaming for iteration ${iteration}`);
  
  try {
    // Prepare sources text
    const sourcesText = sources
      .map((source, index) => {
        const content = source.content || '';
        const truncatedContent = content.length > 3000 ? content.slice(0, 3000) + "..." : content;
        return `SOURCE ${index + 1}: ${source.url}\nTITLE: ${source.title || 'No title'}\nCONTENT: ${truncatedContent}`;
      })
      .join('\n\n')
      .slice(0, 15000); // Limit total sources text

    // Log some stats
    console.log(`Processing ${sources.length} sources with total text length: ${sourcesText.length}`);
    
    // Create an empty iteration object in the database
    const { data: iterationData, error: iterationError } = await supabaseAdmin
      .from('research_jobs')
      .update({
        iterations: supabaseAdmin.rpc('append_to_array', {
          arr: [{
            iteration,
            analysis: '',
            reasoning: '',
            sources: sources.map(s => ({ url: s.url, title: s.title }))
          }],
          field: 'iterations',
          table_name: 'research_jobs',
          row_id: jobId
        })
      })
      .eq('id', jobId)
      .select('iterations')
      .single();

    if (iterationError) {
      console.error(`Error initializing iteration ${iteration} for job ${jobId}:`, iterationError);
      throw new Error(`Failed to initialize iteration: ${iterationError.message}`);
    }

    // Prepare the system prompt
    const systemPrompt = `
      You are an advanced research analyst providing detailed insight about a topic.
      Analyze the provided sources thoroughly and provide:
      
      1. A comprehensive analysis on the question: "${query}" ${focusText ? `with special focus on: ${focusText}` : ''}
      2. Your reasoning for the conclusions, with explicit reference to the sources
      
      Your analysis should be factual, objective, and well-structured.
    `;

    // Prepare the user prompt
    const userPrompt = `
      QUERY: ${query}
      ${focusText ? `FOCUS AREA: ${focusText}` : ''}
      
      SOURCES:
      ${sourcesText}
      
      Based on these sources, provide:
      1. A comprehensive analysis addressing the query
      2. Your detailed reasoning process
    `;

    // Log streaming begins
    console.log(`Starting OpenRouter streaming request for job ${jobId}, iteration ${iteration}`);
    await updateJobProgress(jobId, [`Iteration ${iteration}: Analyzing information from ${sources.length} sources`]);

    // Make the streaming request to OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SUPABASE_URL,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        stream: true,
        max_tokens: 4000,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenRouter API request failed with status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    // Process the stream
    let buffer = "";
    let updateCounter = 0;
    
    while (!streamComplete) {
      // Check for timeout
      const currentTime = Date.now();
      if (currentTime - lastChunkTime > streamTimeout && !stallDetected) {
        console.warn(`Stream stalled for job ${jobId}, iteration ${iteration} - forcing completion`);
        stallDetected = true;
        // Don't break yet, give one more chance in case data is still coming
      }
      
      // Read the next chunk
      const { done, value } = await reader.read();
      
      if (done) {
        console.log(`Stream marked as done for job ${jobId}, iteration ${iteration}`);
        streamComplete = true;
        break;
      }
      
      // Reset timeout tracker since we got data
      lastChunkTime = Date.now();
      
      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete messages in buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer
      
      for (const line of lines) {
        if (!line.trim() || line.trim() === "data: [DONE]") {
          if (line.trim() === "data: [DONE]") {
            console.log(`Received [DONE] marker for job ${jobId}, iteration ${iteration}`);
            streamComplete = true;
          }
          continue;
        }
        
        try {
          if (!line.startsWith("data: ")) continue;
          
          const jsonStr = line.slice(6); // Remove "data: " prefix
          const jsonData = JSON.parse(jsonStr);
          chunkBuffer.push(jsonData); // Store raw chunks for debugging
          
          // Extract content from various possible structures
          let deltaContent = null;
          let deltaReasoning = null;
          
          // Handle different possible chunk formats
          if (jsonData.choices && jsonData.choices[0]) {
            const choice = jsonData.choices[0];
            
            // Check for delta content
            if (choice.delta) {
              // First check named fields
              if (choice.delta.content) {
                deltaContent = choice.delta.content;
              }
              if (choice.delta.reasoning) {
                deltaReasoning = choice.delta.reasoning;
              }
              
              // Next check for function_call field which might contain our data
              if (choice.delta.function_call && choice.delta.function_call.arguments) {
                try {
                  const args = JSON.parse(choice.delta.function_call.arguments);
                  if (args.analysis) deltaContent = args.analysis;
                  if (args.reasoning) deltaReasoning = args.reasoning;
                } catch (e) {
                  // Not parseable JSON, might be a partial chunk
                }
              }
            }
            
            // Check for message content
            if (choice.message) {
              if (choice.message.content) {
                deltaContent = choice.message.content;
              }
              if (choice.message.reasoning) {
                deltaReasoning = choice.message.reasoning;
              }
              
              // Check for function_call in message
              if (choice.message.function_call && choice.message.function_call.arguments) {
                try {
                  const args = JSON.parse(choice.message.function_call.arguments);
                  if (args.analysis) deltaContent = args.analysis;
                  if (args.reasoning) deltaReasoning = args.reasoning;
                } catch (e) {
                  // Not parseable JSON, might be a partial response
                }
              }
            }
            
            // If still no content, try parsing the text itself for markdown sections
            if (!deltaContent && !deltaReasoning) {
              let textContent = '';
              if (choice.delta && typeof choice.delta.content === 'string') {
                textContent = choice.delta.content;
              } else if (choice.message && typeof choice.message.content === 'string') {
                textContent = choice.message.content;
              }
              
              if (textContent) {
                // Check for Analysis: or Reasoning: headers in the text
                if (textContent.includes('# Analysis') || textContent.includes('Analysis:')) {
                  deltaContent = textContent;
                } else if (textContent.includes('# Reasoning') || textContent.includes('Reasoning:')) {
                  deltaReasoning = textContent;
                } else {
                  // Default to analysis if can't determine
                  deltaContent = textContent;
                }
              }
            }
          }
          
          // Update our collected content
          if (deltaContent) {
            analysisContent += deltaContent;
          }
          if (deltaReasoning) {
            reasoningContent += deltaReasoning;
          }
          
          // Periodically update the database (every 10 chunks)
          updateCounter++;
          if (updateCounter % 10 === 0 || streamComplete) {
            await updateIterationContent(jobId, iteration, analysisContent, reasoningContent);
            console.log(`Updated iteration ${iteration} content, analysis: ${analysisContent.length} chars, reasoning: ${reasoningContent.length} chars`);
          }
        } catch (parseError) {
          console.error(`Error parsing stream chunk for job ${jobId}, iteration ${iteration}:`, parseError);
          // Continue processing other chunks
        }
      }
      
      // Check if we've detected a stall and had one more chance to process data
      if (stallDetected) {
        console.log(`Forcing stream completion for job ${jobId}, iteration ${iteration} after processing stalled chunks`);
        streamComplete = true;
        break;
      }
    }
    
    // Ensure final content is updated to database
    await updateIterationContent(jobId, iteration, analysisContent, reasoningContent);
    console.log(`Completed streaming for job ${jobId}, iteration ${iteration}`);
    console.log(`Final content lengths - analysis: ${analysisContent.length} chars, reasoning: ${reasoningContent.length} chars`);
    
    // Post-process content - if we didn't get separate reasoning, try to extract it
    if (reasoningContent.length === 0 && analysisContent.length > 0) {
      // Look for sections that might contain reasoning
      const lowerContent = analysisContent.toLowerCase();
      const reasoningKeywords = ['reasoning', 'rationale', 'analysis', 'explanation'];
      
      for (const keyword of reasoningKeywords) {
        const keywordIndex = lowerContent.indexOf(keyword);
        if (keywordIndex > 0) {
          // Found a possible reasoning section, extract it
          reasoningContent = analysisContent.slice(keywordIndex);
          analysisContent = analysisContent.slice(0, keywordIndex);
          break;
        }
      }
      
      // If we extracted reasoning, update the database one more time
      if (reasoningContent.length > 0) {
        await updateIterationContent(jobId, iteration, analysisContent, reasoningContent);
        console.log(`Extracted reasoning section, updated content - analysis: ${analysisContent.length} chars, reasoning: ${reasoningContent.length} chars`);
      }
    }
    
    return {
      analysis: analysisContent,
      reasoning: reasoningContent
    };
  } catch (error) {
    console.error(`Error in generateAnalysisWithStreaming for job ${jobId}, iteration ${iteration}:`, error);
    
    // Try to salvage what we have so far
    if (analysisContent.length > 0) {
      console.log(`Saving partial content despite error - analysis: ${analysisContent.length} chars, reasoning: ${reasoningContent.length} chars`);
      await updateIterationContent(jobId, iteration, analysisContent, reasoningContent);
      
      return {
        analysis: analysisContent,
        reasoning: reasoningContent
      };
    }
    
    throw error;
  }
}

async function updateIterationContent(jobId: string, iteration: number, analysis: string, reasoning: string) {
  try {
    // Get current iterations array
    const { data: jobData, error: getError } = await supabaseAdmin
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
      
    if (getError || !jobData || !jobData.iterations) {
      console.error(`Error getting iterations for job ${jobId}:`, getError);
      return;
    }
    
    // Find and update the specific iteration
    const iterations = jobData.iterations;
    const iterationIndex = iterations.findIndex((it: any) => it.iteration === iteration);
    
    if (iterationIndex === -1) {
      console.error(`Iteration ${iteration} not found in job ${jobId}`);
      return;
    }
    
    // Update the iteration
    iterations[iterationIndex].analysis = analysis;
    iterations[iterationIndex].reasoning = reasoning;
    
    // Save back to the database
    const { error: updateError } = await supabaseAdmin
      .from('research_jobs')
      .update({ iterations })
      .eq('id', jobId);
      
    if (updateError) {
      console.error(`Error updating iteration ${iteration} for job ${jobId}:`, updateError);
      return;
    }
    
    console.log(`Successfully updated iteration ${iteration} with ${analysis.length} analysis chars and ${reasoning.length} reasoning chars`);
    
    // Also record to the stream table
    try {
      await supabaseAdmin
        .from('analysis_stream')
        .insert({
          job_id: jobId,
          iteration,
          sequence: Date.now(), // Use timestamp as sequence for ordering
          chunk: analysis
        });
    } catch (streamError) {
      console.error(`Error recording to analysis_stream for job ${jobId}:`, streamError);
      // Non-critical, continue even if this fails
    }
  } catch (error) {
    console.error(`Unexpected error in updateIterationContent for job ${jobId}:`, error);
  }
}

async function extractStructuredInsights(sources: any[], query: string, analysis: string, jobId: string) {
  try {
    console.log(`Extracting structured insights for job ${jobId}`);

    const { data, error } = await supabaseAdmin.functions.invoke('extract-research-insights', {
      body: { 
        query,
        sources: sources.map(s => ({ url: s.url, title: s.title })),
        analysis 
      }
    });

    if (error) {
      console.error('Error extracting insights:', error);
      return null;
    }

    if (!data) {
      console.warn('No insights returned');
      return null;
    }

    console.log('Successfully extracted structured insights');
    return data;
  } catch (error) {
    console.error('Error in extractStructuredInsights:', error);
    return null;
  }
}

// Helper function to truncate text
function truncateText(text: string, maxLength: number) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Serve the HTTP function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json();

    // Validate required parameters
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'marketId and query are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract user ID from auth header if available
    let userId = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && user) {
          userId = user.id;
        }
      } catch (authError) {
        console.error('Error authenticating user:', authError);
        // Continue as anonymous user
      }
    }

    // Create the research job
    const job = await createResearchJob(
      marketId, 
      query, 
      Math.min(Math.max(1, maxIterations), 5), // Limit between 1-5 iterations
      userId,
      focusText,
      notificationEmail
    );

    return new Response(
      JSON.stringify({ success: true, jobId: job.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error handling request:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'An unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
