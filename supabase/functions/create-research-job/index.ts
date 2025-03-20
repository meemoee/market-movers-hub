
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.1"

// Environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Setup Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createResearchJob(payload: any) {
  try {
    const { 
      marketId, 
      query, 
      maxIterations = 3,
      focusText,
      notificationEmail 
    } = payload;

    if (!marketId || !query) {
      throw new Error('Missing required parameters: marketId and query are required');
    }
    
    const userId = payload.userId || null;

    // Create a research job
    const jobData = {
      market_id: marketId,
      user_id: userId,
      query,
      status: 'queued',
      max_iterations: maxIterations,
      current_iteration: 0,
      progress_log: ['Job created and queued for processing'],
      iterations: [],
      focus_text: focusText || null,
      notification_email: notificationEmail || null,
      notification_sent: false
    };

    const { data: jobResponse, error: jobError } = await supabase
      .from('research_jobs')
      .insert(jobData)
      .select()
      .single();

    if (jobError) {
      console.error("Error creating research job:", jobError);
      throw new Error(`Failed to create research job: ${jobError.message}`);
    }

    const jobId = jobResponse.id;
    console.log(`Created research job with ID: ${jobId}`);

    // Start the job processing in background
    processJobInBackground(jobId, maxIterations, query, marketId, focusText)
      .catch(error => {
        console.error(`Error in background processing for job ${jobId}:`, error);
        updateJobStatus(jobId, 'failed', error.message);
      });

    return { success: true, jobId };
  } catch (error) {
    console.error("Error in createResearchJob:", error);
    throw error;
  }
}

async function updateJobStatus(jobId: string, status: string, errorMessage?: string) {
  try {
    const updateData: any = { 
      status, 
      updated_at: new Date().toISOString()
    };

    if (status === 'processing' && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage && status === 'failed') {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('research_jobs')
      .update(updateData)
      .eq('id', jobId);

    if (error) {
      console.error(`Error updating job ${jobId} status to ${status}:`, error);
    } else {
      console.log(`Updated job ${jobId} status to ${status}`);
    }
  } catch (error) {
    console.error(`Error in updateJobStatus for job ${jobId}:`, error);
  }
}

async function appendProgressLog(jobId: string, message: string) {
  try {
    const { error } = await supabase.rpc(
      'append_progress_log',
      { job_id: jobId, log_message: message }
    );

    if (error) {
      console.error(`Error appending progress log for job ${jobId}:`, error);
    }
  } catch (error) {
    console.error(`Error in appendProgressLog for job ${jobId}:`, error);
  }
}

async function sendEmail(email: string, jobId: string, results: any) {
  try {
    console.log(`Would send email to ${email} for job ${jobId} if email functionality was implemented`);
    // Here you would implement email sending functionality
    
    // Mark notification as sent
    const { error } = await supabase
      .from('research_jobs')
      .update({ notification_sent: true })
      .eq('id', jobId);
      
    if (error) {
      console.error(`Error marking notification as sent for job ${jobId}:`, error);
    }
  } catch (error) {
    console.error(`Error sending email notification for job ${jobId}:`, error);
  }
}

async function processStreamingResponse(reader: ReadableStreamDefaultReader, onChunk: (chunk: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // Process buffer line by line
      const lines = buffer.split('\n');
      buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer
      
      for (const line of lines) {
        if (line.trim() && line.startsWith('data: ')) {
          const dataContent = line.substring(6);
          
          if (dataContent === '[DONE]') {
            console.log("Stream completed with [DONE] marker");
            continue;
          }
          
          try {
            onChunk(dataContent);
          } catch (err) {
            console.error("Error processing stream chunk:", err);
          }
        }
      }
    }
    
    // Process any remaining content in the buffer
    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.trim() && line.startsWith('data: ')) {
          const dataContent = line.substring(6);
          
          if (dataContent === '[DONE]') {
            console.log("Stream completed with [DONE] marker in final buffer");
            continue;
          }
          
          try {
            onChunk(dataContent);
          } catch (err) {
            console.error("Error processing final stream chunk:", err);
          }
        }
      }
    }
    
    console.log("Stream processing completed successfully");
  } catch (err) {
    console.error("Error reading from stream:", err);
    throw err;
  }
}

async function invokeWebScrapeFunction(jobId: string, iteration: number, requestBody: any): Promise<any> {
  try {
    // Start timer
    const startTime = Date.now();
    
    // Add the jobId to the request
    const requestWithJobId = {
      ...requestBody,
      jobId,
      iteration
    };
    
    console.log(`Calling web-scrape for job ${jobId}, iteration ${iteration}`);
    
    // Call the web-scrape function
    const response = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(requestWithJobId)
    });
    
    // Record response time
    const responseTime = (Date.now() - startTime) / 1000;
    console.log(`web-scrape responded in ${responseTime.toFixed(1)}s for job ${jobId}, iteration ${iteration}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`web-scrape function returned error ${response.status}: ${errorText}`);
      throw new Error(`web-scrape function returned status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`web-scrape results for job ${jobId}, iteration ${iteration}: ${result.data?.length || 0} items`);
    
    return result;
  } catch (error) {
    console.error(`Error calling web-scrape for job ${jobId}, iteration ${iteration}:`, error);
    throw error;
  }
}

async function invokeAnalyzeWebContentFunction(jobId: string, iteration: number, requestBody: any): Promise<string> {
  try {
    // Start timer
    const startTime = Date.now();
    
    // Add the jobId to the request
    const requestWithJobId = {
      ...requestBody,
      jobId,
      iteration
    };
    
    console.log(`Calling analyze-web-content for job ${jobId}, iteration ${iteration}`);
    
    // Call the analyze-web-content function
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-web-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(requestWithJobId)
    });
    
    // Record response time
    const responseTime = (Date.now() - startTime) / 1000;
    console.log(`analyze-web-content responded in ${responseTime.toFixed(1)}s for job ${jobId}, iteration ${iteration}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`analyze-web-content function returned error ${response.status}: ${errorText}`);
      throw new Error(`analyze-web-content function returned status ${response.status}: ${errorText}`);
    }
    
    // This is a streaming response, we need to accumulate the chunks
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get reader from response");
    }
    
    let accumulatedAnalysis = '';
    
    // Set up streaming response handler
    await processStreamingResponse(reader, (chunkData) => {
      try {
        const parsed = JSON.parse(chunkData);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          accumulatedAnalysis += content;
        }
      } catch (e) {
        console.warn(`Error parsing stream chunk in analyze-web-content for job ${jobId}, iteration ${iteration}:`, e);
      }
    });

    console.log(`Completed streaming analyze-web-content for job ${jobId}, iteration ${iteration}`);
    console.log(`Analysis length: ${accumulatedAnalysis.length} characters`);
    
    // Ensure we have a complete analysis
    if (accumulatedAnalysis.length < 10) {
      throw new Error(`Analysis seems incomplete (only ${accumulatedAnalysis.length} chars)`);
    }
    
    return accumulatedAnalysis;
  } catch (error) {
    console.error(`Error calling analyze-web-content for job ${jobId}, iteration ${iteration}:`, error);
    throw error;
  }
}

async function invokeGenerateQueriesFunction(jobId: string, iteration: number, requestBody: any): Promise<string[]> {
  try {
    // Start timer
    const startTime = Date.now();
    
    // Add the jobId to the request
    const requestWithJobId = {
      ...requestBody,
      jobId,
      iteration
    };
    
    console.log(`Calling generate-queries for job ${jobId}, iteration ${iteration}`);
    
    // Call the generate-queries function
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(requestWithJobId)
    });
    
    // Record response time
    const responseTime = (Date.now() - startTime) / 1000;
    console.log(`generate-queries responded in ${responseTime.toFixed(1)}s for job ${jobId}, iteration ${iteration}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`generate-queries function returned error ${response.status}: ${errorText}`);
      throw new Error(`generate-queries function returned status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`generate-queries results for job ${jobId}, iteration ${iteration}: ${result.queries?.length || 0} queries`);
    
    return result.queries || [];
  } catch (error) {
    console.error(`Error calling generate-queries for job ${jobId}, iteration ${iteration}:`, error);
    throw error;
  }
}

async function invokeExtractResearchInsights(jobId: string, requestBody: any): Promise<any> {
  try {
    // Start timer
    const startTime = Date.now();
    
    // Add the jobId to the request
    const requestWithJobId = {
      ...requestBody,
      jobId
    };
    
    console.log(`Calling extract-research-insights for job ${jobId}`);
    
    // Call the extract-research-insights function
    const response = await fetch(`${supabaseUrl}/functions/v1/extract-research-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(requestWithJobId)
    });
    
    // Record response time
    const responseTime = (Date.now() - startTime) / 1000;
    console.log(`extract-research-insights responded in ${responseTime.toFixed(1)}s for job ${jobId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`extract-research-insights function returned error ${response.status}: ${errorText}`);
      throw new Error(`extract-research-insights function returned status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`extract-research-insights results for job ${jobId}:`, result);
    
    return result;
  } catch (error) {
    console.error(`Error calling extract-research-insights for job ${jobId}:`, error);
    throw error;
  }
}

async function updateJobIteration(jobId: string, iterationNumber: number, iterationData: any) {
  try {
    // Get current iterations
    const { data: jobData, error: getError } = await supabase
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
    
    if (getError) {
      console.error(`Error getting job ${jobId} iterations:`, getError);
      throw getError;
    }
    
    // Update the iterations array
    let iterations = jobData.iterations || [];
    
    // Find the iteration with the matching iteration number
    const existingIndex = iterations.findIndex((iter: any) => iter.iteration === iterationNumber);
    
    if (existingIndex >= 0) {
      // Update existing iteration
      iterations[existingIndex] = {
        ...iterations[existingIndex],
        ...iterationData
      };
    } else {
      // Add new iteration
      iterations.push({
        iteration: iterationNumber,
        ...iterationData
      });
    }
    
    // Update the job record
    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({
        iterations,
        current_iteration: iterationNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    if (updateError) {
      console.error(`Error updating job ${jobId} iterations:`, updateError);
      throw updateError;
    } else {
      console.log(`Updated job ${jobId} with iteration ${iterationNumber} data. Analysis chars: ${iterationData.analysis?.length || 0}`);
    }
  } catch (error) {
    console.error(`Error in updateJobIteration for job ${jobId}:`, error);
    throw error;
  }
}

async function finalizeJobResults(jobId: string) {
  try {
    // Get job data
    const { data: jobData, error: getError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (getError) {
      console.error(`Error getting job ${jobId} data:`, getError);
      throw getError;
    }
    
    // Compile final results
    const iterations = jobData.iterations || [];
    const latestIteration = iterations[iterations.length - 1] || {};
    
    // Extract data from the latest iteration
    const results = {
      data: latestIteration.results || [],
      analysis: latestIteration.analysis || "",
      structuredInsights: null
    };
    
    // Update the job with results
    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({
        results,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    if (updateError) {
      console.error(`Error updating job ${jobId} with final results:`, updateError);
      throw updateError;
    } else {
      console.log(`Updated job ${jobId} with final results`);
    }
    
    return results;
  } catch (error) {
    console.error(`Error in finalizeJobResults for job ${jobId}:`, error);
    throw error;
  }
}

async function processJobInBackground(jobId: string, maxIterations: number, query: string, marketId: string, focusText?: string) {
  try {
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    await appendProgressLog(jobId, 'Starting background processing');
    
    // Track cumulative data for the job
    let cumulativeResults: any[] = [];
    let cumulativeAnalysis = '';
    
    // Process each iteration
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      try {
        await appendProgressLog(jobId, `Starting iteration ${iteration} of ${maxIterations}`);
        
        // Step 1: Generate search queries based on accumulated knowledge
        await appendProgressLog(jobId, `Generating search queries for iteration ${iteration}`);
        
        let queries: string[];
        try {
          queries = await invokeGenerateQueriesFunction(jobId, iteration, {
            query,
            marketId,
            focusText,
            iterations: iteration > 1 ? iteration - 1 : 0,
            previousContent: cumulativeAnalysis
          });
          
          if (!queries || queries.length === 0) {
            throw new Error("No queries generated");
          }
          
          await appendProgressLog(jobId, `Generated ${queries.length} search queries`);
          
          // Log the first few queries
          for (let i = 0; i < Math.min(queries.length, 3); i++) {
            await appendProgressLog(jobId, `Query ${i + 1}: "${queries[i]}"`);
          }
        } catch (error) {
          console.error(`Error generating queries for job ${jobId}, iteration ${iteration}:`, error);
          await appendProgressLog(jobId, `Error generating queries: ${error.message}`);
          
          // Use fallback queries
          queries = [
            query,
            `${query} latest information`,
            `${query} analysis`
          ];
          
          await appendProgressLog(jobId, `Using fallback queries due to error`);
        }
        
        // Update iteration with queries
        await updateJobIteration(jobId, iteration, { queries });
        
        // Step 2: Web scrape based on the queries
        await appendProgressLog(jobId, `Performing web search for iteration ${iteration}`);
        
        let scrapeResults;
        try {
          scrapeResults = await invokeWebScrapeFunction(jobId, iteration, {
            queries,
            marketId,
            marketDescription: query,
            focusText
          });
          
          if (!scrapeResults.data || scrapeResults.data.length === 0) {
            await appendProgressLog(jobId, `No results found from web search`);
          } else {
            await appendProgressLog(jobId, `Found ${scrapeResults.data.length} results from web search`);
            
            // Add results to cumulative results
            cumulativeResults = [...cumulativeResults, ...scrapeResults.data];
          }
        } catch (error) {
          console.error(`Error in web scrape for job ${jobId}, iteration ${iteration}:`, error);
          await appendProgressLog(jobId, `Error in web search: ${error.message}`);
          scrapeResults = { data: [] };
        }
        
        // Update iteration with results
        await updateJobIteration(jobId, iteration, { results: scrapeResults.data });
        
        // Step 3: Analyze the scraped content
        await appendProgressLog(jobId, `Analyzing search results for iteration ${iteration}`);
        
        if (scrapeResults.data && scrapeResults.data.length > 0) {
          try {
            // Extract complete analysis - this should now properly wait for full streaming completion
            const analysis = await invokeAnalyzeWebContentFunction(jobId, iteration, {
              data: scrapeResults.data,
              query,
              marketId,
              previousContent: cumulativeAnalysis,
              focusText
            });
            
            if (!analysis || analysis.length < 50) {
              throw new Error(`Incomplete analysis received (${analysis.length} chars)`);
            }
            
            await appendProgressLog(jobId, `Completed analysis for iteration ${iteration}`);
            
            // Update cumulative analysis
            cumulativeAnalysis += `\n\nIteration ${iteration} Analysis:\n${analysis}`;
            
            // Update iteration with analysis
            await updateJobIteration(jobId, iteration, { analysis });
            
            // Add a small delay to ensure all DB operations complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (error) {
            console.error(`Error analyzing content for job ${jobId}, iteration ${iteration}:`, error);
            await appendProgressLog(jobId, `Error analyzing search results: ${error.message}`);
            
            // Set a placeholder analysis for this iteration
            await updateJobIteration(jobId, iteration, { 
              analysis: `Error analyzing content: ${error.message}` 
            });
          }
        } else {
          await appendProgressLog(jobId, `Skipping analysis for iteration ${iteration} due to no search results`);
          
          // Set a placeholder analysis for this iteration
          await updateJobIteration(jobId, iteration, { 
            analysis: "No search results were found to analyze for this iteration." 
          });
        }
        
        // Add a small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing iteration ${iteration} for job ${jobId}:`, error);
        await appendProgressLog(jobId, `Error in iteration ${iteration}: ${error.message}`);
      }
    }
    
    // Ensure a proper delay before final steps to make sure all streams complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // After all iterations, finalize the job
    await appendProgressLog(jobId, `Finalizing research with ${cumulativeResults.length} total results from ${maxIterations} iterations`);
    
    try {
      // Get the final results
      const finalResults = await finalizeJobResults(jobId);
      
      // Generate insights based on the final results and all iterations
      if (finalResults.analysis && finalResults.analysis.length > 100) {
        await appendProgressLog(jobId, `Extracting research insights`);
        
        try {
          // Make sure we have the latest job data with all iterations
          const { data: jobData } = await supabase
            .from('research_jobs')
            .select('*')
            .eq('id', jobId)
            .single();
            
          const iterations = jobData.iterations || [];
          
          // Call the extract-research-insights function with the latest data
          const insightsResult = await invokeExtractResearchInsights(jobId, {
            analysis: finalResults.analysis,
            query,
            marketId,
            iterations
          });
          
          if (insightsResult && insightsResult.structuredInsights) {
            await appendProgressLog(jobId, `Successfully extracted research insights`);
            
            // Update the job with structured insights
            const { error: updateError } = await supabase
              .from('research_jobs')
              .update({
                results: {
                  ...finalResults,
                  structuredInsights: insightsResult.structuredInsights
                }
              })
              .eq('id', jobId);
            
            if (updateError) {
              console.error(`Error updating job ${jobId} with insights:`, updateError);
              await appendProgressLog(jobId, `Error updating job with insights: ${updateError.message}`);
            }
          } else {
            await appendProgressLog(jobId, `No insights were extracted from the research`);
          }
        } catch (error) {
          console.error(`Error extracting insights for job ${jobId}:`, error);
          await appendProgressLog(jobId, `Error extracting insights: ${error.message}`);
        }
      } else {
        await appendProgressLog(jobId, `Skipping insights extraction due to insufficient analysis data`);
      }
      
      // Update job status to completed
      await updateJobStatus(jobId, 'completed');
      await appendProgressLog(jobId, `Research job completed successfully`);
      
      // Send email notification if requested
      const { data: jobData } = await supabase
        .from('research_jobs')
        .select('notification_email')
        .eq('id', jobId)
        .single();
      
      if (jobData.notification_email) {
        await appendProgressLog(jobId, `Sending email notification to ${jobData.notification_email}`);
        await sendEmail(jobData.notification_email, jobId, finalResults);
      }
      
    } catch (error) {
      console.error(`Error finalizing job ${jobId}:`, error);
      await appendProgressLog(jobId, `Error finalizing research: ${error.message}`);
      await updateJobStatus(jobId, 'failed', error.message);
    }
    
  } catch (error) {
    console.error(`Error in background processing for job ${jobId}:`, error);
    await updateJobStatus(jobId, 'failed', error.message);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the request payload
    const payload = await req.json();
    
    // Get current user if auth header is present
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    
    if (authHeader) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.split(' ')[1]);
      
      if (userError) {
        console.warn("Auth error:", userError);
      } else if (user) {
        userId = user.id;
        payload.userId = userId;
      }
    }
    
    // Create the research job
    const result = await createResearchJob(payload);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error("Error in create-research-job function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
