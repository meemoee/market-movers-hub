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

// Helper function to update job record
async function updateJobRecord(jobId: string, updates: JobUpdateParams) {
  if (!jobId) return;
  
  try {
    // If progress_log is provided, use append_to_json_array RPC
    if (updates.progress_log && updates.progress_log.length > 0) {
      for (const logEntry of updates.progress_log) {
        await supabase.rpc('append_to_json_array', {
          p_array: 'progress_log',
          p_value: logEntry
        });
      }
      delete updates.progress_log;
    }
    
    // For iterations, use direct update or append if needed
    if (updates.iterations) {
      // First get current iterations
      const { data: currentJob, error: getError } = await supabase
        .from('research_jobs')
        .select('iterations')
        .eq('id', jobId)
        .single();
      
      if (!getError && currentJob) {
        // Append new iterations to existing ones
        updates.iterations = [...(currentJob.iterations || []), ...updates.iterations];
      }
    }
    
    // Regular update for all other fields
    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    if (updateError) {
      console.error('Error updating job:', updateError);
      console.error('Update error details:', JSON.stringify(updateError));
    } else {
      console.log(`Successfully updated job ${jobId} with:`, Object.keys(updates).join(', '));
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
    const { queries, marketId, focusText, jobId, iteration = 1 } = await req.json();
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId}, focusText: ${typeof focusText === 'string' ? focusText : 'not a string'}, jobId: ${jobId || 'none'}, iteration: ${iteration}`);
    
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
    
    // Create or update research job record if jobId is provided
    let researchJobId = jobId;
    
    try {
      // Extract user ID from request auth header
      const authHeader = req.headers.get('Authorization');
      let userId = 'anonymous';
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (!userError && userData?.user) {
          userId = userData.user.id;
        }
      }
      
      if (!researchJobId) {
        // Create new research job
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
      } else {
        // Update existing job with current iteration
        await updateJobRecord(researchJobId, {
          current_iteration: iteration,
          status: 'processing',
          progress_log: [{ 
            timestamp: new Date().toISOString(), 
            status: 'processing', 
            message: `Starting iteration ${iteration}` 
          }]
        });
      }
    } catch (dbError) {
      console.error('Database error creating job:', dbError);
      console.error('Full error:', JSON.stringify(dbError));
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
                message: `Processing query ${index + 1}/${cleanedQueries.length}: ${query}`
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
                
                // Add to iteration data
                iterationData.results = [...iterationData.results, ...validResults];
                
                // Stream results for this query - keep existing streaming behavior
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'results',
                  data: validResults
                })}\n\n`));
                
                // Update job with results in database if we have a job ID
                if (researchJobId) {
                  try {
                    await updateJobRecord(researchJobId, {
                      results: allResults
                    });
                  } catch (resultsError) {
                    console.error('Exception updating job results:', resultsError);
                  }
                }
                
              } catch (error) {
                console.error(`Error processing query "${query}":`, error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: `Error searching for "${query}": ${error.message}`
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
                await updateJobRecord(researchJobId, {
                  iterations: [iterationData],
                  current_iteration: iteration,
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  results: allResults,
                  progress_log: [{
                    timestamp: new Date().toISOString(),
                    status: 'completed',
                    message: 'Web search completed'
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
              message: `Error in search processing: ${error.message}`
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
