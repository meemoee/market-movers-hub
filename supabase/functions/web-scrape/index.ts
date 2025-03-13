
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SearchResponse } from "./types.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { queries, marketId, focusText } = await req.json();
    
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
    
    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        // Create a research job
        const createJob = async () => {
          try {
            const supabaseClient = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_ANON_KEY') ?? '',
              {
                global: {
                  headers: { Authorization: req.headers.get('Authorization')! },
                }
              }
            );
            
            const { data: jobData, error: jobError } = await supabaseClient
              .from('research_jobs')
              .insert({
                query: cleanedQueries.join(' | '),
                market_id: marketId || null,
                focus_text: focusText || null,
                status: 'processing'
              })
              .select()
              .single();
            
            if (jobError) {
              console.error('Error creating job:', jobError);
              throw new Error('Failed to create research job');
            }
            
            return jobData.id;
          } catch (error) {
            console.error('Error in job creation:', error);
            throw error;
          }
        };
        
        const processQueries = async () => {
          let allResults = [];
          let jobId = null;
          
          try {
            // Create job and send job_created event
            jobId = await createJob();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'job_created',
              jobId: jobId,
              message: 'Research job created'
            })}\n\n`));
            
            for (const [index, query] of cleanedQueries.entries()) {
              // Send a message for each query
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
                
                // Stream results for this query
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'results',
                  data: validResults
                })}\n\n`));
                
              } catch (error) {
                console.error(`Error processing query "${query}":`, error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: `Error searching for "${query}": ${error.message}`
                })}\n\n`));
              }
            }
            
            // Update job status to completed
            if (jobId) {
              const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                {
                  global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                  }
                }
              );
              
              await supabaseClient.rpc('update_research_job_status', {
                job_id: jobId,
                new_status: 'completed'
              });
              
              await supabaseClient.rpc('update_research_results', {
                job_id: jobId,
                result_data: allResults
              });
              
              // Send job status update
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'job_status',
                jobId: jobId,
                status: 'completed'
              })}\n\n`));
            }
            
            // Notify completion
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error("Error in processQueries:", error);
            
            // Update job status to failed if there was an error
            if (jobId) {
              const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                {
                  global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                  }
                }
              );
              
              await supabaseClient.rpc('update_research_job_status', {
                job_id: jobId,
                new_status: 'failed',
                error_msg: error.message
              });
              
              // Send job status update
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'job_status',
                jobId: jobId,
                status: 'failed'
              })}\n\n`));
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              message: `Error in search processing: ${error.message}`
            })}\n\n`));
            controller.close();
          }
        };
        
        // Start processing queries
        processQueries();
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
