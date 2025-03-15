
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { SSEMessage } from "./types.ts"

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
        // Rate limiting implementation
        // Create chunks of queries to process with rate limiting
        const CHUNK_SIZE = 5; // Process 5 queries at a time
        const DELAY_BETWEEN_CHUNKS_MS = 1000; // 1 second delay between chunks
        const DELAY_BETWEEN_REQUESTS_MS = 200; // 200ms between individual requests (5 per second)
        
        // Split queries into chunks
        const queryChunks = [];
        for (let i = 0; i < cleanedQueries.length; i += CHUNK_SIZE) {
          queryChunks.push(cleanedQueries.slice(i, i + CHUNK_SIZE));
        }
        
        console.log(`[Background][${jobId}] Split ${cleanedQueries.length} queries into ${queryChunks.length} chunks of max ${CHUNK_SIZE}`);
        
        // Process each chunk with delay between them
        for (const [chunkIndex, queryChunk] of queryChunks.entries()) {
          console.log(`[Background][${jobId}] Processing chunk ${chunkIndex + 1}/${queryChunks.length} with ${queryChunk.length} queries`);
          
          // Process queries in this chunk with delay between each request
          for (const [index, query] of queryChunk.entries()) {
            const queryIndex = chunkIndex * CHUNK_SIZE + index;
            console.log(`[Background][${jobId}] Processing query ${queryIndex + 1}/${cleanedQueries.length}: ${query}`);

            try {
              // Set a reasonable timeout for each search
              const abortController = new AbortController();
              const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout
              
              // Brave API request with retry logic
              let braveResponse = null;
              let retries = 0;
              const MAX_RETRIES = 3;
              let backoffDelay = 1000; // Start with 1 second backoff
              
              while (retries <= MAX_RETRIES && !braveResponse) {
                try {
                  const braveApiKey = Deno.env.get('BRAVE_API_KEY');
                  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
                    headers: {
                      'Accept': 'application/json',
                      'Accept-Encoding': 'gzip',
                      'X-Subscription-Token': braveApiKey
                    },
                    signal: abortController.signal
                  });
                  
                  // Check for rate limiting response
                  if (response.status === 429) {
                    retries++;
                    console.log(`[Background][${jobId}] Rate limited by Brave API, retry ${retries}/${MAX_RETRIES}`);
                    
                    // Check for rate limit headers
                    const resetTime = response.headers.get('X-RateLimit-Reset');
                    if (resetTime) {
                      const waitTime = parseInt(resetTime) * 1000 - Date.now();
                      if (waitTime > 0) {
                        console.log(`[Background][${jobId}] Waiting for rate limit reset: ${waitTime}ms`);
                        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 30000))); // Wait for reset or max 30 seconds
                      }
                    } else {
                      // Exponential backoff if no reset header
                      console.log(`[Background][${jobId}] Applying exponential backoff: ${backoffDelay}ms`);
                      await new Promise(resolve => setTimeout(resolve, backoffDelay));
                      backoffDelay *= 2; // Exponential backoff
                    }
                    continue; // Try again
                  }
                  
                  if (!response.ok) {
                    console.error(`[Background][${jobId}] Brave search returned ${response.status}`);
                    break; // Give up on this query
                  }
                  
                  braveResponse = await response.json();
                } catch (e) {
                  if (e.name === 'AbortError') {
                    console.log(`[Background][${jobId}] Search request timed out for query: ${query}`);
                    break; // Don't retry timeouts
                  }
                  
                  retries++;
                  console.error(`[Background][${jobId}] Error searching, retry ${retries}/${MAX_RETRIES}:`, e);
                  
                  if (retries <= MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                    backoffDelay *= 2; // Exponential backoff
                  }
                }
              }
              
              clearTimeout(timeoutId);
              
              if (!braveResponse) {
                console.log(`[Background][${jobId}] Failed to get results for query after ${MAX_RETRIES} retries: ${query}`);
                continue; // Move on to the next query
              }
              
              const webPages = braveResponse.web?.results || [];
              
              console.log(`[Background][${jobId}] Found ${webPages.length} pages for query: ${query}`);
              
              // Get the content for each page with exponential backoff for failures
              const pageResults = await Promise.all(webPages.map(async (page) => {
                let retries = 0;
                const MAX_CONTENT_RETRIES = 2;
                let contentBackoffDelay = 1000;
                
                while (retries <= MAX_CONTENT_RETRIES) {
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
                    retries++;
                    
                    if (error.name === 'AbortError' || retries > MAX_CONTENT_RETRIES) {
                      console.log(`[Background][${jobId}] Fetch timeout or max retries for ${page.url}, using description`);
                      return {
                        url: page.url,
                        title: page.title,
                        content: page.description
                      };
                    }
                    
                    console.error(`[Background][${jobId}] Error fetching content for ${page.url}, retry ${retries}/${MAX_CONTENT_RETRIES}:`, error);
                    await new Promise(resolve => setTimeout(resolve, contentBackoffDelay));
                    contentBackoffDelay *= 2; // Exponential backoff
                  }
                }
                
                // Fallback if loop exits without returning
                return {
                  url: page.url,
                  title: page.title,
                  content: page.description
                };
              }));
              
              // Filter out empty results
              const validResults = pageResults.filter(r => r.content && r.content.length > 0);
              allResults = [...allResults, ...validResults];
              
              console.log(`[Background][${jobId}] Processed query ${queryIndex + 1}/${cleanedQueries.length} with ${validResults.length} valid results`);
              
              // Add delay between individual requests within a chunk
              if (index < queryChunk.length - 1) {
                console.log(`[Background][${jobId}] Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before next request`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
              }
              
            } catch (error) {
              console.error(`[Background][${jobId}] Error processing query "${query}":`, error);
            }
          }
          
          // Add delay between chunks
          if (chunkIndex < queryChunks.length - 1) {
            console.log(`[Background][${jobId}] Completed chunk ${chunkIndex + 1}/${queryChunks.length}. Waiting ${DELAY_BETWEEN_CHUNKS_MS}ms before next chunk`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
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
