import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SearchResponse, SSEMessage, JobUpdateParams } from "./types.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// HELPER FUNCTION TO UPDATE JOB RECORD
async function updateJobRecord(jobId: string, updates: JobUpdateParams) {
  if (!jobId) return;
  
  try {
    console.log(`Updating job ${jobId} with:`, JSON.stringify(Object.keys(updates)));
    
    // IF progress_log is provided, use append_to_json_array RPC
    if (updates.progress_log && updates.progress_log.length > 0) {
      for (const logEntry of updates.progress_log) {
        try {
          await supabase.rpc('append_to_json_array', {
            p_table: 'research_jobs',
            p_column: 'progress_log',
            p_id: jobId,
            p_value: logEntry
          });
        } catch (rpcError) {
          console.error('Error appending to progress_log:', rpcError);
        }
      }
      // Remove progress_log from direct update to avoid conflicts
      delete updates.progress_log;
    }
    
    // For iterations, get current iterations first and then append new ones
    if (updates.iterations && updates.iterations.length > 0) {
      try {
        // First get current iterations
        const { data: currentJob, error: getError } = await supabase
          .from('research_jobs')
          .select('iterations, max_iterations')
          .eq('id', jobId)
          .single();
        
        if (!getError && currentJob) {
          // Initialize the current iterations array if it's null
          const currentIterations = Array.isArray(currentJob.iterations) ? currentJob.iterations : [];
          console.log(`Current iterations: ${currentIterations.length}, adding ${updates.iterations.length} new iterations`);
          
          // Create a new array to hold the combined iterations
          let newIterations = [...currentIterations];
          
          // Process each new iteration
          updates.iterations.forEach(newIter => {
            if (!newIter.iteration) {
              console.log('Warning: Iteration missing iteration number:', newIter);
              return;
            }
            
            // Find if we're updating an existing iteration or adding a new one
            const existingIndex = newIterations.findIndex(
              existing => existing && existing.iteration === newIter.iteration
            );
            
            if (existingIndex >= 0) {
              // Update existing iteration, keeping existing results if the new iteration doesn't have any
              const existingResults = newIterations[existingIndex].results || [];
              const newResults = newIter.results || [];
              
              newIterations[existingIndex] = {
                ...newIterations[existingIndex],
                ...newIter,
                // Combine results from both
                results: [
                  ...existingResults,
                  ...newResults
                ]
              };
            } else {
              // Add new iteration
              newIterations.push(newIter);
            }
          });
          
          // Sort the iterations array by iteration number for consistency
          newIterations.sort((a, b) => (a.iteration || 0) - (b.iteration || 0));
          
          updates.iterations = newIterations;
          console.log(`Updated iterations array now has ${updates.iterations.length} items`);
        }
      } catch (iterError) {
        console.error('Error updating iterations:', iterError);
      }
    }
    
    // For results, combine with existing results to avoid duplicates
    if (updates.results && updates.results.length > 0) {
      try {
        const { data: currentJob, error: getError } = await supabase
          .from('research_jobs')
          .select('results')
          .eq('id', jobId)
          .single();
        
        if (!getError && currentJob) {
          const currentResults = Array.isArray(currentJob.results) ? currentJob.results : [];
          // Combine results, using URL as unique identifier
          const combinedResults = [...currentResults];
          
          updates.results.forEach(newResult => {
            if (!newResult || !newResult.url) {
              console.log('Warning: Result missing URL:', newResult);
              return;
            }
            
            const existingIndex = combinedResults.findIndex(
              existing => existing && existing.url === newResult.url
            );
            
            if (existingIndex >= 0) {
              // Update existing result with newer content if available
              combinedResults[existingIndex] = {
                ...combinedResults[existingIndex],
                ...newResult
              };
            } else {
              // Add new result
              combinedResults.push(newResult);
            }
          });
          
          updates.results = combinedResults;
          console.log(`Combined results: ${updates.results.length} items`);
        }
      } catch (resultsError) {
        console.error('Error combining results:', resultsError);
      }
    }
    
    // Check if this is the final iteration - get max_iterations if not provided
    let maxIterations = updates.max_iterations;
    let currentIteration = updates.current_iteration;
    
    if (maxIterations === undefined || currentIteration === undefined) {
      try {
        const { data: jobData, error: getJobError } = await supabase
          .from('research_jobs')
          .select('max_iterations, current_iteration')
          .eq('id', jobId)
          .single();
          
        if (!getJobError && jobData) {
          maxIterations = maxIterations ?? jobData.max_iterations;
          currentIteration = currentIteration ?? jobData.current_iteration;
        }
      } catch (fetchError) {
        console.error('Error fetching job details:', fetchError);
      }
    }
    
    // Only mark as completed if this is the final iteration or explicitly requested
    const isFinalIteration = currentIteration !== undefined && 
                             maxIterations !== undefined && 
                             currentIteration >= maxIterations;
    const shouldComplete = updates.status === 'completed' || isFinalIteration;
    
    // If it's the final iteration but status wasn't explicitly set, set it
    if (isFinalIteration && !updates.status) {
      updates.status = 'completed';
    }
    
    // Regular update for all other fields
    try {
      console.log(`Final update for job ${jobId}:`, {
        ...updates,
        completed_at: shouldComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      });
      
      const { error: updateError } = await supabase
        .from('research_jobs')
        .update({
          ...updates,
          // Only set completed_at if we're explicitly completing the job
          completed_at: shouldComplete ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      
      if (updateError) {
        console.error('Error updating job:', updateError);
        console.error('Update error details:', JSON.stringify(updateError));
      } else {
        console.log(`Successfully updated job ${jobId} with:`, Object.keys(updates).join(', '));
        console.log(`Job status: ${updates.status}, completed: ${shouldComplete}, final iteration: ${isFinalIteration}`);
      }
    } catch (updateError) {
      console.error('Exception during final update:', updateError);
    }
  } catch (error) {
    console.error('Exception updating job:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const requestData = await req.json();
    const { 
      queries, 
      marketId, 
      focusText, 
      jobId, 
      iteration = 1, 
      maxIterations = 3 
    } = requestData;
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId || 'none'}, focusText: ${focusText ? focusText.substring(0, 50) + '...' : 'none'}, jobId: ${jobId || 'none'}, iteration: ${iteration}, maxIterations: ${maxIterations}`);
    
    // Check if we have queries and they're in the right format
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid queries parameter' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }
    
    // Ensure queries don't have the market ID accidentally appended
    const cleanedQueries = queries.map((query: string) => {
      return query.replace(new RegExp(` ${marketId}$`), '').trim();
    });
    
    // Create or update research job record if jobId is provided
    let researchJobId = jobId;
    
    try {
      // Extract user ID from request auth header
      const authHeader = req.headers.get('Authorization');
      let userId = 'anonymous';
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const { data: userData, error: userError } = await supabase.auth.getUser(token);
          
          if (!userError && userData?.user) {
            userId = userData.user.id;
          }
        } catch (authError) {
          console.error('Auth error:', authError);
        }
      }
      
      if (!researchJobId) {
        // Create new research job
        console.log('Creating new research job');
        try {
          const { data: jobData, error: jobError } = await supabase
            .from('research_jobs')
            .insert({
              user_id: userId,
              query: cleanedQueries.join(', '),
              market_id: marketId || null,
              focus_text: focusText || null,
              status: 'processing',
              started_at: new Date().toISOString(),
              current_iteration: iteration,
              max_iterations: maxIterations,
              progress_log: [{ timestamp: new Date().toISOString(), status: 'started', message: 'Beginning web search' }],
              results: [],
              iterations: []
            })
            .select('id')
            .single();
            
          if (jobError) {
            console.error('Error creating research job:', jobError);
            console.error('Error details:', JSON.stringify(jobError));
          } else if (jobData) {
            researchJobId = jobData.id;
            console.log(`Created research job with ID: ${researchJobId}`);
          } else {
            console.error('No job data returned after insertion');
          }
        } catch (createError) {
          console.error('Exception creating job:', createError);
        }
      } else {
        // Update existing job with current iteration
        console.log(`Updating existing job ${researchJobId} for iteration ${iteration}`);
        await updateJobRecord(researchJobId, {
          current_iteration: iteration,
          max_iterations: maxIterations,
          status: 'processing', // Always keep as processing until all iterations complete
          progress_log: [{ 
            timestamp: new Date().toISOString(), 
            status: 'processing', 
            message: `Starting iteration ${iteration}` 
          }]
        });
      }
    } catch (dbError) {
      console.error('Database error creating/updating job:', dbError);
    }
    
    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        const processQueries = async () => {
          let allResults = [];
          let iterationData = {
            iteration: iteration,
            queries: cleanedQueries,
            results: [],
            analysis: ''
          };
          
          try {
            for (const [index, query] of cleanedQueries.entries()) {
              // Update progress in database if we have a job ID
              if (researchJobId) {
                try {
                  await updateJobRecord(researchJobId, {
                    progress_log: [{
                      timestamp: new Date().toISOString(),
                      status: 'processing',
                      message: `Processing query ${index + 1}/${cleanedQueries.length}: ${query}`
                    }]
                  });
                } catch (updateError) {
                  console.error('Exception updating job progress:', updateError);
                }
              }
              
              // Send a message for each query - keep existing streaming behavior
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                message: `Processing query ${index + 1}/${cleanedQueries.length}: ${query}`,
                job_id: researchJobId,
                iteration: iteration,
                max_iterations: maxIterations
              })}\n\n`));

              try {
                // Set a reasonable timeout for each search
                const abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController.abort(), 15000); // 15 second timeout
                
                const braveApiKey = Deno.env.get('BRAVE_API_KEY');
                if (!braveApiKey) {
                  throw new Error('BRAVE_API_KEY is not set in environment variables');
                }
                
                console.log(`Searching for: "${query}"`);
                
                const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
                console.log('Search URL:', searchUrl);
                
                const response = await fetch(searchUrl, {
                  headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': braveApiKey
                  },
                  signal: abortController.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error(`Brave search returned ${response.status}:`, errorText);
                  throw new Error(`Brave search returned ${response.status}: ${errorText}`);
                }
                
                const data: SearchResponse = await response.json();
                const webPages = data.web?.results || [];
                
                console.log(`Found ${webPages.length} results for query: "${query}"`);
                
                // Get the content for each page
                const pageResults = await Promise.all(webPages.map(async (page) => {
                  try {
                    // Use a timeout for each content fetch
                    const contentAbortController = new AbortController();
                    const contentTimeoutId = setTimeout(() => contentAbortController.abort(), 8000); // 8 second timeout
                    
                    console.log(`Fetching content for: ${page.url}`);
                    
                    const contentResponse = await fetch(page.url, {
                      signal: contentAbortController.signal
                    });
                    
                    clearTimeout(contentTimeoutId);
                    
                    if (!contentResponse.ok) {
                      console.log(`Content fetch failed for ${page.url}: ${contentResponse.status}`);
                      return {
                        url: page.url,
                        title: page.title,
                        content: page.description
                      };
                    }
                    
                    const html = await contentResponse.text();
                    const text = html
                      .replace(/<head>.*?<\/head>/s, '')
                      .replace(/<style>.*?<\/style>/gs, '')
                      .replace(/<script>.*?<\/script>/gs, '')
                      .replace(/<[^>]*>/g, ' ')
                      .replace(/\s{2,}/g, ' ')
                      .trim();
                    
                    // Limit content to prevent large payloads
                    return {
                      url: page.url,
                      title: page.title,
                      content: text.slice(0, 15000)
                    };
                  } catch (error) {
                    console.error(`Error fetching content for ${page.url}:`, error);
                    return {
                      url: page.url,
                      title: page.title,
                      content: page.description
                    };
                  }
                }));
                
                // Filter out empty results
                const validResults = pageResults.filter(r => r.content && r.content.length > 0);
                allResults = [...allResults, ...validResults];
                
                // Add to iteration data
                iterationData.results = [...iterationData.results, ...validResults];
                
                // Stream results for this query - keep existing streaming behavior
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'results',
                  data: validResults,
                  job_id: researchJobId,
                  iteration: iteration,
                  max_iterations: maxIterations
                })}\n\n`));
                
                // Update job with results in database if we have a job ID
                if (researchJobId) {
                  try {
                    await updateJobRecord(researchJobId, {
                      results: validResults
                    });
                  } catch (resultsError) {
                    console.error('Exception updating job results:', resultsError);
                  }
                }
                
              } catch (error) {
                console.error(`Error processing query "${query}":`, error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: `Error searching for "${query}": ${error.message}`,
                  job_id: researchJobId,
                  iteration: iteration,
                  max_iterations: maxIterations
                })}\n\n`));
                
                // Update job with error in database if we have a job ID
                if (researchJobId) {
                  try {
                    await updateJobRecord(researchJobId, {
                      error_message: `Error searching for "${query}": ${error.message}`,
                      status: 'error'
                    });
                  } catch (errorUpdateError) {
                    console.error('Exception updating job error status:', errorUpdateError);
                  }
                }
              }
            }
            
            // Update job with iteration data
            if (researchJobId) {
              try {
                console.log(`Updating job ${researchJobId} with completed iteration ${iteration} data (max: ${maxIterations})`);
                
                // Determine if this is the final iteration
                const isFinalIteration = iteration >= maxIterations;
                
                await updateJobRecord(researchJobId, {
                  iterations: [iterationData],
                  current_iteration: iteration,
                  max_iterations: maxIterations,
                  // Only set to completed if it's the final iteration
                  status: isFinalIteration ? 'completed' : 'processing',
                  // Only set completed_at if it's the final iteration
                  completed_at: isFinalIteration ? new Date().toISOString() : null,
                  results: allResults,
                  progress_log: [{
                    timestamp: new Date().toISOString(),
                    status: isFinalIteration ? 'completed' : 'processing',
                    message: `Web search ${isFinalIteration ? 'completed' : 'iteration complete'}`
                  }]
                });
              } catch (completeError) {
                console.error('Exception completing job:', completeError);
              }
            }
            
            // Notify completion - keep existing streaming behavior
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error("Error in processQueries:", error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              message: `Error in search processing: ${error.message}`,
              job_id: researchJobId,
              iteration: iteration,
              max_iterations: maxIterations
            })}\n\n`));
            controller.close();
            
            // Update job with error in database if we have a job ID
            if (researchJobId) {
              try {
                await updateJobRecord(researchJobId, {
                  status: 'error',
                  error_message: `Error in search processing: ${error.message}`
                });
              } catch (finalErrorError) {
                console.error('Exception updating final job error:', finalErrorError);
              }
            }
          }
        };
        
        // Start processing queries
        processQueries();
      }
    });
    
    // Return the SSE stream along with the job ID for client reference
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Research-Job-ID': researchJobId || 'none'
      }
    });
    
  } catch (error) {
    console.error("Error in web-scrape function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

