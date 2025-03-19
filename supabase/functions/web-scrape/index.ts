
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { SSEMessage, BraveSearchResult } from "./types.ts"

// Constants for request management
const CHUNK_SIZE = 2; // Process 2 queries at a time
const DELAY_BETWEEN_CHUNKS_MS = 1500; // 1.5 second delay between chunks
const DELAY_BETWEEN_REQUESTS_MS = 350; // 350ms between individual requests
const MAX_CONTENT_RETRIES = 2; // Max retries for content fetching
const FETCH_TIMEOUT_MS = 5000; // 5 second timeout for content fetches

// SSE headers
const sseHeaders = {
  ...corsHeaders,
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
};

// Function to send SSE messages
function writeSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { queries, marketId, focusText, streamToClient } = await req.json();
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId}, focusText: ${typeof focusText === 'string' ? focusText : 'not a string'}, streamToClient: ${streamToClient}`);
    
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
    console.log(`[${jobId}] Starting web research with ${cleanedQueries.length} queries, streamToClient: ${streamToClient}`);

    // If streaming is requested, set up a streaming response
    if (streamToClient) {
      const stream = new ReadableStream({
        start(controller) {
          // Send initial connection message
          writeSSE(controller, 'connected', { 
            message: 'SSE connection established',
            jobId
          });
          
          // Create a function to process the queries in the background and stream results
          const processQueriesStreaming = async () => {
            console.log(`[Streaming][${jobId}] Processing ${cleanedQueries.length} queries in background with streaming`);
            let allResults = [];
            
            try {
              // Split queries into chunks
              const queryChunks = [];
              for (let i = 0; i < cleanedQueries.length; i += CHUNK_SIZE) {
                queryChunks.push(cleanedQueries.slice(i, i + CHUNK_SIZE));
              }
              
              console.log(`[Streaming][${jobId}] Split ${cleanedQueries.length} queries into ${queryChunks.length} chunks of max ${CHUNK_SIZE}`);
              
              // Send initial status update
              writeSSE(controller, 'progress', {
                message: `Starting research with ${cleanedQueries.length} queries`,
                totalQueries: cleanedQueries.length,
                completedQueries: 0,
                jobId
              });
              
              // Process each chunk with delay between them
              for (const [chunkIndex, queryChunk] of queryChunks.entries()) {
                console.log(`[Streaming][${jobId}] Processing chunk ${chunkIndex + 1}/${queryChunks.length} with ${queryChunk.length} queries`);
                
                writeSSE(controller, 'progress', {
                  message: `Processing query chunk ${chunkIndex + 1} of ${queryChunks.length}`,
                  totalQueries: cleanedQueries.length,
                  completedQueries: chunkIndex * CHUNK_SIZE,
                  jobId
                });
                
                // Process queries in this chunk with delay between each request
                for (const [index, query] of queryChunk.entries()) {
                  const queryIndex = chunkIndex * CHUNK_SIZE + index;
                  console.log(`[Streaming][${jobId}] Processing query ${queryIndex + 1}/${cleanedQueries.length}: ${query}`);
                  
                  writeSSE(controller, 'queryProgress', {
                    message: `Processing query: ${query}`,
                    queryIndex: queryIndex + 1,
                    totalQueries: cleanedQueries.length,
                    query,
                    jobId
                  });

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
                      console.error(`[Streaming][${jobId}] Brave search failed: ${braveResponse.status} ${errorText}`);
                      
                      writeSSE(controller, 'error', {
                        message: `Failed to search for: ${query}`,
                        queryIndex: queryIndex + 1,
                        totalQueries: cleanedQueries.length,
                        error: errorText,
                        jobId
                      });
                      
                      continue; // Skip to next query on failure
                    }
                    
                    const braveData: BraveSearchResult = await braveResponse.json();
                    const webPages = braveData.web?.results || [];
                    
                    console.log(`[Streaming][${jobId}] Found ${webPages.length} pages for query: ${query}`);
                    
                    writeSSE(controller, 'searchResults', {
                      message: `Found ${webPages.length} results for: ${query}`,
                      queryIndex: queryIndex + 1,
                      totalQueries: cleanedQueries.length,
                      resultCount: webPages.length,
                      query,
                      jobId
                    });
                    
                    // Get the content for each page with exponential backoff for failures
                    const pageResults = await Promise.all(webPages.map(async (page, pageIndex) => {
                      let retries = 0;
                      let contentBackoffDelay = 1000;
                      
                      writeSSE(controller, 'contentFetching', {
                        message: `Fetching content from page ${pageIndex + 1} of ${webPages.length}: ${page.title}`,
                        queryIndex: queryIndex + 1,
                        pageIndex: pageIndex + 1,
                        totalPages: webPages.length,
                        title: page.title,
                        url: page.url,
                        jobId
                      });
                      
                      while (retries <= MAX_CONTENT_RETRIES) {
                        try {
                          // Use a timeout for each content fetch
                          const contentAbortController = new AbortController();
                          const contentTimeoutId = setTimeout(() => contentAbortController.abort(), FETCH_TIMEOUT_MS);
                          
                          const contentResponse = await fetch(page.url, {
                            signal: contentAbortController.signal
                          });
                          
                          clearTimeout(contentTimeoutId);
                          
                          if (!contentResponse.ok) {
                            console.log(`[Streaming][${jobId}] Failed to fetch content for ${page.url}, using description`);
                            
                            writeSSE(controller, 'contentWarning', {
                              message: `Could not fetch full content, using summary for: ${page.title}`,
                              url: page.url,
                              jobId
                            });
                            
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
                          
                          const contentLength = text.length;
                          console.log(`[Streaming][${jobId}] Successfully fetched content from ${page.url}, length: ${contentLength}`);
                          
                          writeSSE(controller, 'contentSuccess', {
                            message: `Successfully fetched content from: ${page.title}`,
                            queryIndex: queryIndex + 1,
                            pageIndex: pageIndex + 1,
                            url: page.url,
                            contentLength,
                            truncated: contentLength > 15000,
                            jobId
                          });
                          
                          return {
                            url: page.url,
                            title: page.title,
                            content: text.slice(0, 15000)
                          };
                        } catch (error) {
                          retries++;
                          
                          if (error.name === 'AbortError' || retries > MAX_CONTENT_RETRIES) {
                            console.log(`[Streaming][${jobId}] Fetch timeout or max retries for ${page.url}, using description`);
                            
                            writeSSE(controller, 'contentError', {
                              message: `Error fetching content, using summary for: ${page.title}`,
                              error: error.name === 'AbortError' ? 'timeout' : 'max retries reached',
                              url: page.url,
                              jobId
                            });
                            
                            return {
                              url: page.url,
                              title: page.title,
                              content: page.description
                            };
                          }
                          
                          console.error(`[Streaming][${jobId}] Error fetching content for ${page.url}, retry ${retries}/${MAX_CONTENT_RETRIES}`);
                          
                          writeSSE(controller, 'contentRetry', {
                            message: `Retrying content fetch for: ${page.title}`,
                            retryCount: retries,
                            maxRetries: MAX_CONTENT_RETRIES,
                            url: page.url,
                            jobId
                          });
                          
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
                    
                    console.log(`[Streaming][${jobId}] Processed query ${queryIndex + 1}/${cleanedQueries.length} with ${validResults.length} valid results`);
                    
                    writeSSE(controller, 'queryComplete', {
                      message: `Completed query: ${query}`,
                      queryIndex: queryIndex + 1,
                      totalQueries: cleanedQueries.length,
                      resultCount: validResults.length,
                      totalResultsCount: allResults.length,
                      query,
                      jobId
                    });
                    
                    // Add delay between individual requests within a chunk
                    if (index < queryChunk.length - 1) {
                      console.log(`[Streaming][${jobId}] Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before next request`);
                      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
                    }
                    
                  } catch (error) {
                    console.error(`[Streaming][${jobId}] Error processing query "${query}":`, error);
                    
                    writeSSE(controller, 'error', {
                      message: `Error processing query: ${query}`,
                      error: error.message,
                      queryIndex: queryIndex + 1,
                      totalQueries: cleanedQueries.length,
                      jobId
                    });
                  }
                }
                
                // Add delay between chunks
                if (chunkIndex < queryChunks.length - 1) {
                  console.log(`[Streaming][${jobId}] Completed chunk ${chunkIndex + 1}/${queryChunks.length}. Waiting ${DELAY_BETWEEN_CHUNKS_MS}ms before next chunk`);
                  
                  writeSSE(controller, 'chunkComplete', {
                    message: `Completed query chunk ${chunkIndex + 1} of ${queryChunks.length}`,
                    chunkIndex: chunkIndex + 1,
                    totalChunks: queryChunks.length,
                    resultsCount: allResults.length,
                    jobId
                  });
                  
                  await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
                }
              }
              
              console.log(`[Streaming][${jobId}] All queries processed. Total results: ${allResults.length}`);
              
              // Send final results summary
              writeSSE(controller, 'complete', {
                message: `Research completed with ${allResults.length} total results`,
                totalResults: allResults.length,
                totalQueries: cleanedQueries.length,
                averageResultsPerQuery: (allResults.length / cleanedQueries.length).toFixed(2),
                jobId
              });
              
              // Send the actual results
              writeSSE(controller, 'results', {
                results: allResults,
                jobId
              });
              
              // Close the stream
              controller.close();
              
            } catch (error) {
              console.error(`[Streaming][${jobId}] Error in streaming process:`, error);
              
              // Send error message
              writeSSE(controller, 'error', {
                message: `Research error: ${error.message}`,
                error: error.message,
                jobId
              });
              
              // Close the stream
              controller.close();
            }
          };
          
          // Start processing in the background without blocking the response
          processQueriesStreaming().catch(error => {
            console.error(`[Streaming][${jobId}] Uncaught error in streaming process:`, error);
          });
        }
      });
      
      return new Response(stream, { headers: sseHeaders });
    } else {
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
                
                // Get the content for each page with exponential backoff for failures
                const pageResults = await Promise.all(webPages.map(async (page) => {
                  let retries = 0;
                  let contentBackoffDelay = 1000;
                  
                  while (retries <= MAX_CONTENT_RETRIES) {
                    try {
                      // Use a timeout for each content fetch
                      const contentAbortController = new AbortController();
                      const contentTimeoutId = setTimeout(() => contentAbortController.abort(), FETCH_TIMEOUT_MS);
                      
                      const contentResponse = await fetch(page.url, {
                        signal: contentAbortController.signal
                      });
                      
                      clearTimeout(contentTimeoutId);
                      
                      if (!contentResponse.ok) {
                        console.log(`[Background][${jobId}] Failed to fetch content for ${page.url}, using description`, {
                          status: contentResponse.status,
                          url: page.url,
                          fallbackContentLength: page.description.length
                        });
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
                      
                      const contentLength = text.length;
                      console.log(`[Background][${jobId}] Successfully fetched content from ${page.url}`, {
                        url: page.url,
                        contentLength,
                        truncated: contentLength > 15000
                      });
                      
                      return {
                        url: page.url,
                        title: page.title,
                        content: text.slice(0, 15000)
                      };
                    } catch (error) {
                      retries++;
                      
                      if (error.name === 'AbortError' || retries > MAX_CONTENT_RETRIES) {
                        console.log(`[Background][${jobId}] Fetch timeout or max retries for ${page.url}, using description`, {
                          errorType: error.name === 'AbortError' ? 'timeout' : 'maxRetries',
                          url: page.url,
                          retries
                        });
                        return {
                          url: page.url,
                          title: page.title,
                          content: page.description
                        };
                      }
                      
                      console.error(`[Background][${jobId}] Error fetching content for ${page.url}, retry ${retries}/${MAX_CONTENT_RETRIES}:`, {
                        errorMessage: error.message,
                        errorName: error.name,
                        url: page.url,
                        retryCount: retries,
                        backoffDelay: contentBackoffDelay
                      });
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
                
                console.log(`[Background][${jobId}] Processed query ${queryIndex + 1}/${cleanedQueries.length} with ${validResults.length} valid results`, {
                  validResultCount: validResults.length,
                  totalResultCount: pageResults.length,
                  invalidCount: pageResults.length - validResults.length,
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
    }
    
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
