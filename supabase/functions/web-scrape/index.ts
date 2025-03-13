
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SSEMessage } from "./types.ts"

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
    
    const jobId = crypto.randomUUID();
    console.log(`[${jobId}] Starting web research with ${cleanedQueries.length} queries`);

    // Create a function to process the queries in the background
    const processQueriesInBackground = async () => {
      console.log(`[Background][${jobId}] Processing ${cleanedQueries.length} queries in background`);
      let allResults = [];
      
      try {
        for (const [index, query] of cleanedQueries.entries()) {
          console.log(`[Background][${jobId}] Processing query ${index + 1}/${cleanedQueries.length}: ${query}`);

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
              console.error(`[Background][${jobId}] Brave search returned ${response.status}`);
              continue;
            }
            
            const data = await response.json();
            const webPages = data.web?.results || [];
            
            console.log(`[Background][${jobId}] Found ${webPages.length} pages for query: ${query}`);
            
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
                  console.log(`[Background][${jobId}] Failed to fetch content for ${page.url}, using description`);
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
                
                return {
                  url: page.url,
                  title: page.title,
                  content: text.slice(0, 15000)
                };
              } catch (error) {
                console.error(`[Background][${jobId}] Error fetching content for ${page.url}:`, error);
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
            
            console.log(`[Background][${jobId}] Processed query ${index + 1}/${cleanedQueries.length} with ${validResults.length} valid results`);
            
          } catch (error) {
            console.error(`[Background][${jobId}] Error processing query "${query}":`, error);
          }
        }
        
        console.log(`[Background][${jobId}] All queries processed. Total results: ${allResults.length}`);
      } catch (error) {
        console.error(`[Background][${jobId}] Error in background processing:`, error);
      }
    };

    // Use EdgeRuntime.waitUntil to continue processing in the background
    // @ts-ignore - TypeScript may not recognize EdgeRuntime
    EdgeRuntime.waitUntil(processQueriesInBackground());
    
    // Return immediate response with job ID
    return new Response(
      JSON.stringify({ 
        jobId, 
        message: "Web research started in background. Check logs for progress." 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202 // Accepted
      }
    );
    
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
