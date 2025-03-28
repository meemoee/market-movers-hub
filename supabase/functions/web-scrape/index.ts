
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { SSEMessage, BraveSearchResult, WebContent, WebScrapeRequest, WebScrapeResponse } from "./types.ts"

// Constants for request management
const CHUNK_SIZE = 2; // Process 2 queries at a time
const DELAY_BETWEEN_CHUNKS_MS = 1500; // 1.5 second delay between chunks
const DELAY_BETWEEN_REQUESTS_MS = 350; // 350ms between individual requests
const MAX_CONTENT_RETRIES = 2; // Max retries for content fetching
const FETCH_TIMEOUT_MS = 5000; // 5 second timeout for content fetches

/**
 * Main entry point for the web scrape edge function
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const requestData = await req.json() as WebScrapeRequest;
    const { queries, marketId, focusText } = requestData;
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId}, focusText: ${typeof focusText === 'string' ? focusText : 'not a string'}`);
    
    // Validate and clean input queries
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return createErrorResponse("Invalid queries parameter", 400);
    }
    
    // Ensure queries don't have the market ID accidentally appended
    const cleanedQueries = cleanQueries(queries, marketId);
    
    // Generate a unique job ID
    const jobId = crypto.randomUUID();
    console.log(`[${jobId}] Starting web research with ${cleanedQueries.length} queries`);

    // Process the queries in the background
    // @ts-ignore - TypeScript may not recognize EdgeRuntime
    EdgeRuntime.waitUntil(processQueriesInBackground(jobId, cleanedQueries, marketId));
    
    // Return immediate response with job ID
    const response: WebScrapeResponse = {
      jobId,
      message: "Web research started in background. Check logs for progress."
    };
    
    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202 // Accepted
      }
    );
    
  } catch (error) {
    return createErrorResponse(error.message);
  }
});

/**
 * Creates a formatted error response
 */
function createErrorResponse(message: string, status = 500): Response {
  console.error(`Error in web-scrape function: ${message}`);
  return new Response(
    JSON.stringify({ error: message }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status
    }
  );
}

/**
 * Clean queries to remove any accidental market ID appending
 */
function cleanQueries(queries: string[], marketId: string): string[] {
  return queries.map((query: string) => {
    return query.replace(new RegExp(` ${marketId}$`), '').trim();
  });
}

/**
 * Main background processing function
 */
async function processQueriesInBackground(jobId: string, queries: string[], marketId: string): Promise<void> {
  console.log(`[Background][${jobId}] Processing ${queries.length} queries in background`);
  let allResults: WebContent[] = [];
  
  try {
    // Split queries into chunks for processing
    const queryChunks = chunkArray(queries, CHUNK_SIZE);
    console.log(`[Background][${jobId}] Split ${queries.length} queries into ${queryChunks.length} chunks of max ${CHUNK_SIZE}`);
    
    // Process each chunk with delay between them
    for (const [chunkIndex, queryChunk] of queryChunks.entries()) {
      console.log(`[Background][${jobId}] Processing chunk ${chunkIndex + 1}/${queryChunks.length} with ${queryChunk.length} queries`);
      
      // Process each query in the chunk
      for (const [index, query] of queryChunk.entries()) {
        const queryIndex = chunkIndex * CHUNK_SIZE + index;
        console.log(`[Background][${jobId}] Processing query ${queryIndex + 1}/${queries.length}: ${query}`);

        try {
          // Search and fetch content for this query
          const searchResults = await searchAndFetchContent(jobId, query, queryIndex, queries.length);
          allResults = [...allResults, ...searchResults];
          
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
      totalQueries: queries.length,
      averageResultsPerQuery: (allResults.length / queries.length).toFixed(2),
      processingTimeMs: Date.now() - new Date().getTime()
    });
  } catch (error) {
    console.error(`[Background][${jobId}] Error in background processing:`, {
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack
    });
  }
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Search and fetch content for a specific query
 */
async function searchAndFetchContent(jobId: string, query: string, queryIndex: number, totalQueries: number): Promise<WebContent[]> {
  // Call Brave search endpoint
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
      totalQueries
    });
    return []; // Return empty array on failure
  }
  
  const braveData: BraveSearchResult = await braveResponse.json();
  const webPages = braveData.web?.results || [];
  
  console.log(`[Background][${jobId}] Found ${webPages.length} pages for query: ${query}`, {
    resultCount: webPages.length,
    queryIndex: queryIndex + 1,
    totalQueries,
    urls: webPages.map(p => p.url)
  });
  
  // Fetch content for each page
  const pageResults = await Promise.all(webPages.map(page => 
    fetchPageContent(jobId, page.url, page.title, page.description)
  ));
  
  // Filter out empty results
  const validResults = pageResults.filter(r => r.content && r.content.length > 0);
  
  console.log(`[Background][${jobId}] Processed query ${queryIndex + 1}/${totalQueries} with ${validResults.length} valid results`, {
    validResultCount: validResults.length,
    totalResultCount: pageResults.length,
    invalidCount: pageResults.length - validResults.length
  });
  
  return validResults;
}

/**
 * Fetch content from a web page with retry logic
 */
async function fetchPageContent(
  jobId: string, 
  url: string, 
  title: string, 
  fallbackContent: string
): Promise<WebContent> {
  let retries = 0;
  let contentBackoffDelay = 1000;
  
  while (retries <= MAX_CONTENT_RETRIES) {
    try {
      // Use a timeout for each content fetch
      const contentAbortController = new AbortController();
      const contentTimeoutId = setTimeout(() => contentAbortController.abort(), FETCH_TIMEOUT_MS);
      
      const contentResponse = await fetch(url, {
        signal: contentAbortController.signal
      });
      
      clearTimeout(contentTimeoutId);
      
      if (!contentResponse.ok) {
        console.log(`[Background][${jobId}] Failed to fetch content for ${url}, using description`, {
          status: contentResponse.status,
          url,
          fallbackContentLength: fallbackContent.length
        });
        return {
          url,
          title,
          content: fallbackContent
        };
      }
      
      const html = await contentResponse.text();
      const text = extractTextFromHtml(html);
      
      const contentLength = text.length;
      console.log(`[Background][${jobId}] Successfully fetched content from ${url}`, {
        url,
        contentLength,
        truncated: contentLength > 15000
      });
      
      return {
        url,
        title,
        content: text.slice(0, 15000)
      };
    } catch (error) {
      retries++;
      
      if (error.name === 'AbortError' || retries > MAX_CONTENT_RETRIES) {
        console.log(`[Background][${jobId}] Fetch timeout or max retries for ${url}, using description`, {
          errorType: error.name === 'AbortError' ? 'timeout' : 'maxRetries',
          url,
          retries
        });
        return {
          url,
          title,
          content: fallbackContent
        };
      }
      
      console.error(`[Background][${jobId}] Error fetching content for ${url}, retry ${retries}/${MAX_CONTENT_RETRIES}:`, {
        errorMessage: error.message,
        errorName: error.name,
        url,
        retryCount: retries,
        backoffDelay: contentBackoffDelay
      });
      await new Promise(resolve => setTimeout(resolve, contentBackoffDelay));
      contentBackoffDelay *= 2; // Exponential backoff
    }
  }
  
  // Fallback if loop exits without returning
  return {
    url,
    title,
    content: fallbackContent
  };
}

/**
 * Extract readable text from HTML
 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<head>.*?<\/head>/s, '')
    .replace(/<style>.*?<\/style>/gs, '')
    .replace(/<script>.*?<\/script>/gs, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
