
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { SSEMessage, BraveSearchResult } from "./types.ts"
import { fetchPageContents } from "./contentFetcher.ts"

// Constants for request management
const CHUNK_SIZE = 2; // Process 2 queries at a time
const DELAY_BETWEEN_CHUNKS_MS = 1500; // 1.5 second delay between chunks
const DELAY_BETWEEN_REQUESTS_MS = 350; // 350ms between individual requests

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
              // Directly call our Brave search endpoint
              const braveSearchUrl = "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/brave-search";
              const braveResponse = await fetch(braveSearchUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
                },
                body: JSON.stringify({ query, count: 5 })
              });
              
              if (!braveResponse.ok) {
                const errorText = await braveResponse.text();
                console.error(`[Background][${jobId}] Brave search failed: ${braveResponse.status} ${errorText}`);
                console.log(`[Background][${jobId}] Brave search error details:`, {
                  status: braveResponse.status,
                  errorText,
                  query,
                  queryIndex: queryIndex + 1,
                  totalQueries: cleanedQueries.length
                });
                continue; // Skip to next query on failure
              }
              
              const braveData: BraveSearchResult = await braveResponse.json();
              const webPages = braveData.web?.results || [];
              
              console.log(`[Background][${jobId}] Found ${webPages.length} pages for query: ${query}`, {
                resultCount: webPages.length,
                queryIndex: queryIndex + 1,
                totalQueries: cleanedQueries.length,
                urls: webPages.map(p => p.url)
              });
              
              // Get the content for each page using our utility function
              const validResults = await fetchPageContents(webPages, jobId);
              
              allResults = [...allResults, ...validResults];
              
              console.log(`[Background][${jobId}] Processed query ${queryIndex + 1}/${cleanedQueries.length} with ${validResults.length} valid results`, {
                validResultCount: validResults.length,
                totalResultCount: webPages.length,
                invalidCount: webPages.length - validResults.length,
                cumulativeResults: allResults.length
              });
              
              // Add delay between individual requests within a chunk
              if (index < queryChunk.length - 1) {
                console.log(`[Background][${jobId}] Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before next request`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
              }
              
            } catch (error) {
              console.error(`[Background][${jobId}] Error processing query "${query}":`, {
                errorMessage: error.message,
                errorName: error.name,
                errorStack: error.stack,
                query,
                queryIndex: queryIndex + 1
              });
            }
          }
          
          // Add delay between chunks
          if (chunkIndex < queryChunks.length - 1) {
            console.log(`[Background][${jobId}] Completed chunk ${chunkIndex + 1}/${queryChunks.length}. Waiting ${DELAY_BETWEEN_CHUNKS_MS}ms before next chunk`, {
              completedChunks: chunkIndex + 1,
              totalChunks: queryChunks.length,
              delayMs: DELAY_BETWEEN_CHUNKS_MS,
              resultsCollectedSoFar: allResults.length
            });
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
          }
        }
        
        console.log(`[Background][${jobId}] All queries processed. Total results: ${allResults.length}`, {
          totalResults: allResults.length,
          totalQueries: cleanedQueries.length,
          averageResultsPerQuery: (allResults.length / cleanedQueries.length).toFixed(2),
          processingTimeMs: Date.now() - new Date().getTime()
        });
      } catch (error) {
        console.error(`[Background][${jobId}] Error in background processing:`, {
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack
        });
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
    console.error("Error in web-scrape function:", {
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack
    });
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
