import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SearchResponse, SSEMessage } from "./types.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { queries, marketId, focusText, jobId } = await req.json();
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId}, focusText: ${typeof focusText === 'string' ? focusText : 'not a string'}, jobId: ${jobId || 'none'}`);
    
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
            progress_log: [{ timestamp: new Date().toISOString(), status: 'started', message: 'Beginning web search' }],
            results: []
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
          
          try {
            for (const [index, query] of cleanedQueries.entries()) {
              // Update progress in database if we have a job ID
              if (researchJobId) {
                try {
                  const { error: updateError } = await supabase
                    .from('research_jobs')
                    .update({
                      progress_log: supabase.rpc('append_to_json_array', { 
                        p_array: 'progress_log',
                        p_value: {
                          timestamp: new Date().toISOString(),
                          status: 'processing',
                          message: `Processing query ${index + 1}/${cleanedQueries.length}: ${query}`
                        }
                      }),
                      status: 'processing',
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', researchJobId);
                  
                  if (updateError) {
                    console.error('Error updating job progress:', updateError);
                    console.error('Update error details:', JSON.stringify(updateError));
                  } else {
                    console.log(`Successfully updated progress for job ${researchJobId}, query ${index + 1}`);
                  }
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
                
                // Stream results for this query - keep existing streaming behavior
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'results',
                  data: validResults
                })}\n\n`));
                
                // Update job with results in database if we have a job ID
                if (researchJobId) {
                  try {
                    const { error: resultsError } = await supabase
                      .from('research_jobs')
                      .update({
                        results: allResults,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', researchJobId);
                    
                    if (resultsError) {
                      console.error('Error updating job results:', resultsError);
                      console.error('Results error details:', JSON.stringify(resultsError));
                    } else {
                      console.log(`Successfully updated results for job ${researchJobId}, query ${index + 1}`);
                    }
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
                    const { error: errorUpdateError } = await supabase
                      .from('research_jobs')
                      .update({
                        error_message: `Error searching for "${query}": ${error.message}`,
                        status: 'error',
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', researchJobId);
                    
                    if (errorUpdateError) {
                      console.error('Error updating job error status:', errorUpdateError);
                    }
                  } catch (errorUpdateError) {
                    console.error('Exception updating job error status:', errorUpdateError);
                  }
                }
              }
            }
            
            // Complete the job in the database if we have a job ID
            if (researchJobId) {
              try {
                const { error: completeError } = await supabase
                  .from('research_jobs')
                  .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    results: allResults,
                    progress_log: supabase.rpc('append_to_json_array', { 
                      p_array: 'progress_log',
                      p_value: {
                        timestamp: new Date().toISOString(),
                        status: 'completed',
                        message: 'Web search completed'
                      }
                    }),
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', researchJobId);
                
                if (completeError) {
                  console.error('Error completing job:', completeError);
                  console.error('Complete error details:', JSON.stringify(completeError));
                } else {
                  console.log(`Successfully completed job ${researchJobId}`);
                }
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
                const { error: finalErrorError } = await supabase
                  .from('research_jobs')
                  .update({
                    status: 'error',
                    error_message: `Error in search processing: ${error.message}`,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', researchJobId);
                
                if (finalErrorError) {
                  console.error('Error updating final job error:', finalErrorError);
                }
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
