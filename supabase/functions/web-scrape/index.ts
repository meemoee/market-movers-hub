
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SearchResponse, SSEMessage } from "./types.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Check if a job already exists or create a new one
async function getOrCreateJob(userId: string, marketId: string, query: string, focusText?: string, parentJobId?: string) {
  try {
    // Check for an existing job that's in progress
    const { data: existingJobs, error: queryError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('market_id', marketId)
      .eq('query', query)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (queryError) {
      console.error("Error checking for existing job:", queryError);
      throw queryError;
    }
    
    if (existingJobs && existingJobs.length > 0) {
      console.log(`Found existing running job: ${existingJobs[0].id}`);
      return existingJobs[0];
    }
    
    // Create a new job
    const { data: newJob, error: insertError } = await supabase
      .from('research_jobs')
      .insert({
        user_id: userId,
        market_id: marketId,
        query: query,
        focus_text: focusText || null,
        status: 'pending',
        parent_job_id: parentJobId || null,
        progress_log: [],
        max_iterations: 3
      })
      .select('*')
      .single();
    
    if (insertError) {
      console.error("Error creating new job:", insertError);
      throw insertError;
    }
    
    console.log(`Created new job: ${newJob.id}`);
    return newJob;
  } catch (error) {
    console.error("Error in getOrCreateJob:", error);
    throw error;
  }
}

// Update job status and progress
async function updateJobStatus(jobId: string, updates: any) {
  try {
    const { error } = await supabase
      .from('research_jobs')
      .update(updates)
      .eq('id', jobId);
    
    if (error) {
      console.error(`Error updating job ${jobId}:`, error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to update job ${jobId}:`, error);
    return false;
  }
}

// Add progress message to job
async function addProgressMessage(jobId: string, message: string) {
  try {
    // Get current progress log
    const { data, error: getError } = await supabase
      .from('research_jobs')
      .select('progress_log')
      .eq('id', jobId)
      .single();
    
    if (getError) {
      console.error(`Error fetching progress log for job ${jobId}:`, getError);
      return false;
    }
    
    // Append new message
    const progressLog = Array.isArray(data.progress_log) ? [...data.progress_log] : [];
    progressLog.push({
      message,
      timestamp: new Date().toISOString()
    });
    
    // Update job with new progress log
    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({
        progress_log: progressLog
      })
      .eq('id', jobId);
    
    if (updateError) {
      console.error(`Error updating progress log for job ${jobId}:`, updateError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to add progress message to job ${jobId}:`, error);
    return false;
  }
}

// Add research results to job
async function addJobResults(jobId: string, results: any[], iteration: number) {
  try {
    // Get current job data
    const { data: jobData, error: getError } = await supabase
      .from('research_jobs')
      .select('iterations, results')
      .eq('id', jobId)
      .single();
    
    if (getError) {
      console.error(`Error fetching job data for ${jobId}:`, getError);
      return false;
    }
    
    // Append new results
    const allResults = Array.isArray(jobData.results) ? [...jobData.results] : [];
    allResults.push(...results.filter(r => !allResults.some(existing => existing.url === r.url)));
    
    // Update iterations
    const iterations = Array.isArray(jobData.iterations) ? [...jobData.iterations] : [];
    const iterationIndex = iterations.findIndex(i => i.iteration === iteration);
    
    if (iterationIndex >= 0) {
      iterations[iterationIndex].results = results;
    } else {
      iterations.push({
        iteration,
        results,
        queries: [],
        analysis: ''
      });
    }
    
    // Update job
    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({
        results: allResults,
        iterations,
        current_iteration: iteration
      })
      .eq('id', jobId);
    
    if (updateError) {
      console.error(`Error updating results for job ${jobId}:`, updateError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to add results to job ${jobId}:`, error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { queries, marketId, focusText, authToken } = await req.json();
    
    // Extract user ID from auth token if present
    let userId = null;
    if (authToken) {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser(authToken);
        if (!authError && userData?.user) {
          userId = userData.user.id;
        } else {
          console.error("Auth error:", authError);
        }
      } catch (authError) {
        console.error("Error extracting user from token:", authError);
      }
    }
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      );
    }
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId}, focusText: ${typeof focusText === 'string' ? focusText : 'not a string'}`);
    
    // Ensure queries don't have the market ID accidentally appended
    const cleanedQueries = queries.map((query: string) => {
      return query.replace(new RegExp(` ${marketId}$`), '').trim();
    });
    
    if (!cleanedQueries || !Array.isArray(cleanedQueries) || cleanedQueries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid queries parameter' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }
    
    // Get or create a job
    const job = await getOrCreateJob(userId, marketId, cleanedQueries.join(' | '), focusText);
    
    // Mark job as running
    await updateJobStatus(job.id, {
      status: 'running',
      started_at: new Date().toISOString()
    });
    
    // Record initial progress
    await addProgressMessage(job.id, `Starting web research with ${cleanedQueries.length} queries`);
    if (focusText) {
      await addProgressMessage(job.id, `Research focus: ${focusText}`);
    }
    
    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial job data
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'job',
          jobId: job.id,
          status: 'running'
        })}\n\n`));
        
        const processQueries = async () => {
          let allResults = [];
          let currentIteration = 0;
          
          try {
            for (const [index, query] of cleanedQueries.entries()) {
              currentIteration = index + 1;
              // Send a message for each query
              const message = `Processing query ${currentIteration}/${cleanedQueries.length}: ${query}`;
              
              // Update job progress
              await addProgressMessage(job.id, message);
              
              // Send SSE message
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                message
              })}\n\n`));

              try {
                // Set a reasonable timeout for each search
                const abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout
                
                const braveApiKey = Deno.env.get('BRAVE_API_KEY');
                const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
                  headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': braveApiKey
                  },
                  signal: abortController.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                  throw new Error(`Brave search returned ${response.status}: ${await response.text()}`);
                }
                
                const data: SearchResponse = await response.json();
                const webPages = data.web?.results || [];
                
                // Get the content for each page
                const pageResults = await Promise.all(webPages.map(async (page) => {
                  try {
                    // Use a timeout for each content fetch
                    const contentAbortController = new AbortController();
                    const contentTimeoutId = setTimeout(() => contentAbortController.abort(), 5000); // 5 second timeout
                    
                    const contentResponse = await fetch(page.url, {
                      signal: contentAbortController.signal
                    });
                    
                    clearTimeout(contentTimeoutId);
                    
                    if (!contentResponse.ok) {
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
                
                // Save results to job
                await addJobResults(job.id, validResults, currentIteration);
                
                // Stream results for this query
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'results',
                  data: validResults
                })}\n\n`));
                
              } catch (error) {
                console.error(`Error processing query "${query}":`, error);
                await addProgressMessage(job.id, `Error searching for "${query}": ${error.message}`);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: `Error searching for "${query}": ${error.message}`
                })}\n\n`));
              }
            }
            
            // Mark job as completed
            await updateJobStatus(job.id, {
              status: 'completed',
              completed_at: new Date().toISOString(),
              results: allResults
            });
            
            // Notify completion
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'job',
              jobId: job.id,
              status: 'completed'
            })}\n\n`));
            
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error("Error in processQueries:", error);
            
            // Mark job as failed
            await updateJobStatus(job.id, {
              status: 'failed',
              error_message: `Error in search processing: ${error.message}`,
              completed_at: new Date().toISOString()
            });
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              message: `Error in search processing: ${error.message}`
            })}\n\n`));
            
            controller.close();
          }
        };

        // Set up abort handling for function termination
        addEventListener("beforeunload", (event) => {
          console.log("Function shutting down, saving progress...");
          
          // Try to update job status to indicate interruption
          updateJobStatus(job.id, {
            status: 'running',
            error_message: 'Function execution was interrupted but is continuing in background'
          }).catch(err => {
            console.error("Error updating job status during shutdown:", err);
          });
        });
        
        // Start processing queries using EdgeRuntime.waitUntil
        EdgeRuntime.waitUntil(
          (async () => {
            try {
              await processQueries();
              console.log("Background processing completed successfully");
            } catch (error) {
              console.error("Background processing failed:", error);
              
              // Ensure job is marked as failed
              await updateJobStatus(job.id, {
                status: 'failed',
                error_message: `Fatal error in background processing: ${error.message}`,
                completed_at: new Date().toISOString()
              }).catch(err => {
                console.error("Error updating job status after fatal error:", err);
              });
            }
          })()
        );
      }
    });
    
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
