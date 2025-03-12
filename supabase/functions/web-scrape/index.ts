
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SearchResponse, SSEMessage } from "./types.ts"

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
        
        const processQueries = async () => {
          let allResults = [];
          let currentIteration = 0;
          
          try {
            for (const [index, query] of cleanedQueries.entries()) {
              currentIteration = index + 1;
              // Send a message for each query
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                message: `Processing query ${currentIteration}/${cleanedQueries.length}: ${query}`
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
            
            // Notify completion
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error("Error in processQueries:", error);
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
          // You could save the current state here if needed
        });
        
        // Start processing queries using EdgeRuntime.waitUntil
        EdgeRuntime.waitUntil(
          (async () => {
            try {
              await processQueries();
              console.log("Background processing completed successfully");
            } catch (error) {
              console.error("Background processing failed:", error);
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
