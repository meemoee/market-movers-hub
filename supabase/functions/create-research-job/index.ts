
// Required framework dependencies
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Response message types
interface ServerResponse {
  success: boolean;
  error?: string;
  jobId?: string;
}

interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: string;
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  created_at: string;
  updated_at: string;
  user_id?: string;
  focus_text?: string;
  notification_email?: string;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Main server handler
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json();

    // Validate inputs
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: marketId and query' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    // Create a research job
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        focus_text: focusText,
        notification_email: notificationEmail,
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating research job:', jobError);
      return new Response(
        JSON.stringify({ success: false, error: `Error creating research job: ${jobError.message}` }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }

    // Start the background research process
    const jobId = job.id;
    console.log(`Created research job with ID: ${jobId}`);

    // Start the research job processing in the background using EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(processJob(jobId));

    // Return immediate success response
    return new Response(
      JSON.stringify({ success: true, jobId }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Unexpected error: ${error.message}` }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});

// The main job processing function
async function processJob(jobId: string): Promise<void> {
  try {
    console.log(`Starting background processing for job ${jobId}`);
    
    // Update job status to processing
    await supabase.rpc('update_research_job_status', { 
      job_id: jobId,
      new_status: 'processing'
    });
    
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Starting research process...'
    });
    
    // Get the job details
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      throw new Error(`Could not retrieve job details: ${jobError?.message}`);
    }

    const maxIterations = job.max_iterations || 3;
    const query = job.query;
    const focusText = job.focus_text;
    
    // Add initial job data to progress log
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Processing research job for query: ${query}`
    });

    if (focusText) {
      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: `Research focus: ${focusText}`
      });
    }

    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Set to run ${maxIterations} research iterations`
    });
    
    // Perform the main research process
    const results = await performResearch(jobId, query, maxIterations, focusText);
    
    // Update job with final results
    await supabase.rpc('update_research_results', {
      job_id: jobId,
      result_data: results
    });
    
    // Mark job as completed
    await supabase.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'completed'
    });
    
    // Send notification if email is provided
    const notificationEmail = job.notification_email;
    if (notificationEmail) {
      try {
        // Invoke the notification function
        const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/send-research-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            jobId,
            email: notificationEmail,
            query
          })
        });
        
        if (!notifyResponse.ok) {
          const errorText = await notifyResponse.text();
          console.error(`Error sending notification: ${errorText}`);
        } else {
          console.log(`Notification sent to ${notificationEmail}`);
          
          // Update notification sent status
          await supabase
            .from('research_jobs')
            .update({ notification_sent: true })
            .eq('id', jobId);
        }
      } catch (notifyError) {
        console.error('Error sending notification:', notifyError);
      }
    }
    
    console.log(`Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    
    // Add error to progress log
    try {
      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: `Error: ${error.message}`
      });
      
      // Mark job as failed
      await supabase.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed',
        error_msg: error.message
      });
    } catch (logError) {
      console.error('Error updating job status after failure:', logError);
    }
  }
}

// Perform the iterative research process
async function performResearch(jobId: string, query: string, maxIterations: number, focusText?: string): Promise<any> {
  // Initialize results object
  let finalResults: any = {
    data: [],
    analysis: '',
    structuredInsights: null
  };
  
  // FIXED: Create an in-memory array to store all iteration data
  let allIterationsData: any[] = [];
  
  try {
    // Generate search queries based on the initial question
    const searchQueries = await generateSearchQueries(jobId, query, focusText);
    console.log(`Generated ${searchQueries.length} search queries`);
    
    // Add the initial queries to the progress log
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Generated ${searchQueries.length} search queries for research`
    });
    
    // Create the first iteration
    const initialIterationData = {
      iteration: 1,
      queries: searchQueries,
      results: [],
      analysis: '',
      reasoning: ''
    };
    
    // FIXED: Add the initial iteration to our in-memory array
    allIterationsData.push(initialIterationData);
    
    // Write the initial iteration to the database for UI visibility
    await supabase.rpc('append_research_iteration', {
      job_id: jobId,
      iteration_data: JSON.stringify([initialIterationData])
    });
    
    // Update current iteration
    await supabase
      .from('research_jobs')
      .update({ current_iteration: 1 })
      .eq('id', jobId);
    
    // Process each iteration
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Starting research iteration ${i} of ${maxIterations}`);
      
      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: `Starting research iteration ${i} of ${maxIterations}`
      });
      
      // FIXED: Get the current iteration data from our in-memory array
      const currentIteration = allIterationsData.find(iter => iter.iteration === i);
      
      // FIXED: Add error handling if iteration not found
      if (!currentIteration) {
        console.error(`No iteration data found for iteration ${i}`);
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Error: No data found for iteration ${i}`
        });
        continue;
      }
      
      const queries = currentIteration.queries || [];
      
      if (queries.length === 0) {
        console.error(`No queries found for iteration ${i}`);
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Error: No queries found for iteration ${i}`
        });
        continue;
      }
      
      // Perform web scraping for the current queries
      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: `Web scraping ${queries.length} queries...`
      });
      
      const scrapedResults = await performWebScraping(jobId, queries, i);
      
      if (!scrapedResults || scrapedResults.length === 0) {
        console.warn(`No results found for queries in iteration ${i}`);
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Warning: No results found for queries in iteration ${i}`
        });
      } else {
        console.log(`Retrieved ${scrapedResults.length} results from web scraping`);
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Retrieved ${scrapedResults.length} results from web scraping`
        });
      }
      
      // FIXED: Update the results in our in-memory data
      currentIteration.results = scrapedResults || [];
      
      // Update the iteration with results in the database
      await supabase.rpc('update_iteration_field', {
        job_id: jobId,
        iteration_num: i,
        field_key: 'results',
        field_value: JSON.stringify(scrapedResults || [])
      });
      
      // Generate analysis from the results
      await supabase.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: `Analyzing research data from iteration ${i}...`
      });
      
      // FIXED: Generate analysis with streaming and capture the output
      const analysisData = await generateAnalysisWithStreaming(jobId, i, query, scrapedResults, focusText);
      
      // FIXED: Update the analysis and reasoning in our in-memory data
      if (analysisData) {
        currentIteration.analysis = analysisData.analysis || '';
        currentIteration.reasoning = analysisData.reasoning || '';
      }
      
      // If not the last iteration, generate new queries for the next iteration
      if (i < maxIterations) {
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Planning next research iteration...`
        });
        
        // FIXED: Use the analysis from our in-memory array
        const analysis = currentIteration.analysis || '';
        
        // Generate follow-up queries based on the analysis
        const nextQueries = await generateFollowupQueries(jobId, query, analysis, focusText);
        
        // Create the next iteration
        const nextIterationData = {
          iteration: i + 1,
          queries: nextQueries,
          results: [],
          analysis: '',
          reasoning: ''
        };
        
        // FIXED: Add the next iteration to our in-memory array
        allIterationsData.push(nextIterationData);
        
        // Write the next iteration to the database for UI visibility
        await supabase.rpc('append_research_iteration', {
          job_id: jobId,
          iteration_data: JSON.stringify([nextIterationData])
        });
        
        // Update current iteration
        await supabase
          .from('research_jobs')
          .update({ current_iteration: i + 1 })
          .eq('id', jobId);
      }
    }
    
    // Complete the final analysis and extract insights
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Completing final research analysis...`
    });
    
    // FIXED: Use our in-memory array for final analysis
    const allIterations = allIterationsData;
    
    // Extract data from all iterations
    const allResults: any[] = [];
    let combinedAnalysis = '';
    
    allIterations.forEach((iteration: any) => {
      if (iteration.results && Array.isArray(iteration.results)) {
        allResults.push(...iteration.results);
      }
      
      if (iteration.analysis) {
        combinedAnalysis += `\n\nIteration ${iteration.iteration} Analysis:\n${iteration.analysis}`;
      }
    });
    
    // Generate a final comprehensive analysis
    const finalAnalysis = await generateFinalAnalysisWithStreaming(jobId, query, allResults, combinedAnalysis, focusText);
    
    // Extract structured insights
    const structuredInsights = await extractStructuredInsights(jobId, query, finalAnalysis, allResults, focusText);
    
    // Prepare final results
    finalResults = {
      data: allResults.slice(0, 50), // Limit to most relevant 50 results
      analysis: finalAnalysis,
      structuredInsights
    };
    
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Research complete with ${allResults.length} total sources analyzed`
    });
    
    return finalResults;
    
  } catch (error) {
    console.error('Error in performResearch:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Research error: ${error.message}`
    });
    throw error;
  }
}

// Generate search queries based on the initial question
async function generateSearchQueries(jobId: string, query: string, focusText?: string): Promise<string[]> {
  try {
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Generating search queries...'
    });
    
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ 
        query, 
        focusText
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate search queries: ${errorText}`);
    }
    
    const result = await response.json();
    return result.queries || [];
    
  } catch (error) {
    console.error('Error generating search queries:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Error generating search queries: ${error.message}`
    });
    throw error;
  }
}

// Perform web scraping for the given queries
async function performWebScraping(jobId: string, queries: string[], iterationNumber: number): Promise<any[]> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ 
        jobId,
        queries,
        iterationNumber
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to perform web scraping: ${errorText}`);
    }
    
    const result = await response.json();
    return result.results || [];
    
  } catch (error) {
    console.error('Error in web scraping:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Error in web scraping: ${error.message}`
    });
    throw error;
  }
}

// FIXED: Modified to return analysis data
interface AnalysisStreamResult {
  analysis: string;
  reasoning: string;
}

// Generate analysis from scraped results with streaming
async function generateAnalysisWithStreaming(
  jobId: string, 
  iterationNumber: number, 
  query: string, 
  results: any[], 
  focusText?: string
): Promise<AnalysisStreamResult> {
  try {
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Generating analysis for iteration ${iterationNumber}...`
    });
    
    // If no results, create a simple analysis noting the lack of data
    if (!results || results.length === 0) {
      const noDataAnalysis = 'No data was found for the search queries in this iteration.';
      
      await supabase.rpc('update_iteration_field', {
        job_id: jobId,
        iteration_num: iterationNumber,
        field_key: 'analysis',
        field_value: noDataAnalysis
      });
      
      return { analysis: noDataAnalysis, reasoning: '' };
    }
    
    // Prepare the content for analysis
    const content = {
      jobId,
      iteration: iterationNumber,
      query,
      focusText,
      results
    };
    
    // Stream the analysis generation
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-web-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify(content)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate analysis: ${errorText}`);
    }
    
    // FIXED: Process the streaming response and return the result
    return await processStream(response, jobId, iterationNumber);
    
  } catch (error) {
    console.error('Error generating analysis:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Error generating analysis: ${error.message}`
    });
    throw error;
  }
}

// FIXED: Modified to return complete analysis and reasoning strings
async function processStream(response: Response, jobId: string, iterationNumber: number): Promise<AnalysisStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }
  
  let done = false;
  let analysisComplete = '';
  let reasoningComplete = '';
  let analysisBuffer = '';
  let reasoningBuffer = '';
  let updateCounter = 0;
  const updateInterval = 5; // Update database every 5 chunks
  
  try {
    while (!done) {
      const { done: doneReading, value } = await reader.read();
      done = doneReading;
      
      if (done) break;
      
      // Process the chunk
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = JSON.parse(line.substring(6));
            
            // Memory monitoring log
            console.log(`Buffer sizes - Analysis: ${analysisBuffer.length} chars, Reasoning: ${reasoningBuffer.length} chars`);
            
            if (jsonData.type === 'analysis' && jsonData.content) {
              analysisBuffer += jsonData.content;
              analysisComplete += jsonData.content;
              updateCounter++;
            } else if (jsonData.type === 'reasoning' && jsonData.content) {
              reasoningBuffer += jsonData.content;
              reasoningComplete += jsonData.content;
              updateCounter++;
            }
            
            // Periodically update the database with buffer contents
            if (updateCounter >= updateInterval) {
              updateCounter = 0;
              await updateDatabase(jobId, iterationNumber, analysisBuffer, reasoningBuffer);
              
              // Clear the buffers after successful updates
              analysisBuffer = '';
              reasoningBuffer = '';
            }
          } catch (parseError) {
            console.error('Error parsing streaming data:', parseError);
          }
        }
      }
    }
    
    // Final update with any remaining buffer content
    if (analysisBuffer.length > 0 || reasoningBuffer.length > 0) {
      await updateDatabase(jobId, iterationNumber, analysisBuffer, reasoningBuffer);
    }
    
    return {
      analysis: analysisComplete,
      reasoning: reasoningComplete
    };
    
  } catch (error) {
    console.error('Error processing stream:', error);
    throw error; // Re-throw to be caught by the outer error handler
  }
}

// Helper function to update the database with streaming content
async function updateDatabase(
  jobId: string, 
  iterationNumber: number,
  analysisBuffer: string,
  reasoningBuffer: string
): Promise<void> {
  try {
    // Update analysis if there's content in the buffer
    if (analysisBuffer.length > 0) {
      const { error: analysisError } = await supabase.rpc('append_iteration_field_text', {
        job_id: jobId,
        iteration_num: iterationNumber,
        field_key: 'analysis',
        append_text: analysisBuffer
      });
      
      if (analysisError) {
        throw analysisError;
      }
      
      console.log(`Successfully updated iteration ${iterationNumber} with ${analysisBuffer.length} analysis chars`);
    }
    
    // Update reasoning if there's content in the buffer
    if (reasoningBuffer.length > 0) {
      const { error: reasoningError } = await supabase.rpc('append_iteration_field_text', {
        job_id: jobId,
        iteration_num: iterationNumber,
        field_key: 'reasoning',
        append_text: reasoningBuffer
      });
      
      if (reasoningError) {
        throw reasoningError;
      }
      
      console.log(`Successfully updated iteration ${iterationNumber} with ${reasoningBuffer.length} reasoning chars`);
    }
  } catch (updateError) {
    console.error('Error updating database with streaming content:', updateError);
    throw updateError; // Re-throw to be caught by the outer handler
  }
}

// Generate follow-up queries based on the analysis
async function generateFollowupQueries(
  jobId: string, 
  query: string, 
  analysis: string, 
  focusText?: string
): Promise<string[]> {
  try {
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Generating follow-up search queries...'
    });
    
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ 
        query, 
        analysis,
        focusText,
        isFollowup: true
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate follow-up search queries: ${errorText}`);
    }
    
    const result = await response.json();
    return result.queries || [];
    
  } catch (error) {
    console.error('Error generating follow-up queries:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Error generating follow-up queries: ${error.message}`
    });
    throw error;
  }
}

// Generate final analysis with streaming
async function generateFinalAnalysisWithStreaming(
  jobId: string, 
  query: string, 
  results: any[], 
  combinedAnalysis: string,
  focusText?: string
): Promise<string> {
  let finalAnalysis = '';
  
  try {
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Generating final comprehensive analysis...'
    });
    
    // Prepare the content for final analysis
    const content = {
      jobId,
      query,
      focusText,
      results: results.slice(0, 50), // Limit to most relevant 50 results
      previousAnalysis: combinedAnalysis
    };
    
    // Stream the final analysis generation
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-web-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        ...content,
        isFinalAnalysis: true
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate final analysis: ${errorText}`);
    }
    
    // Process the streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }
    
    let done = false;
    let analysisBuffer = '';
    
    while (!done) {
      const { done: doneReading, value } = await reader.read();
      done = doneReading;
      
      if (done) break;
      
      // Process the chunk
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = JSON.parse(line.substring(6));
            
            // Memory monitoring log
            console.log(`Final analysis buffer size: ${analysisBuffer.length} chars`);
            
            if (jsonData.type === 'analysis' && jsonData.content) {
              analysisBuffer += jsonData.content;
              finalAnalysis += jsonData.content;
              
              // Periodically log buffer size but don't accumulate in memory
              if (analysisBuffer.length > 5000) {
                console.log(`Processed ${analysisBuffer.length} chars of final analysis`);
                analysisBuffer = ''; // Clear buffer after logging
              }
            }
          } catch (parseError) {
            console.error('Error parsing streaming data:', parseError);
          }
        }
      }
    }
    
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Final analysis generation complete'
    });
    
    return finalAnalysis;
    
  } catch (error) {
    console.error('Error generating final analysis:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Error generating final analysis: ${error.message}`
    });
    throw error;
  }
}

// Extract structured insights from the analysis
async function extractStructuredInsights(
  jobId: string, 
  query: string, 
  analysis: string, 
  results: any[],
  focusText?: string
): Promise<any> {
  try {
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Extracting structured insights from analysis...'
    });
    
    const response = await fetch(`${supabaseUrl}/functions/v1/extract-research-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ 
        query, 
        analysis,
        results: results.slice(0, 20), // Limit to most relevant 20 results
        focusText
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to extract insights: ${errorText}`);
    }
    
    const result = await response.json();
    
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: 'Structured insights extraction complete'
    });
    
    return result.insights;
    
  } catch (error) {
    console.error('Error extracting insights:', error);
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: `Error extracting insights: ${error.message}`
    });
    return null;
  }
}
