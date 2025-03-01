
import { corsHeaders } from "../_shared/cors.ts";
import { SearchResult } from "./types.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface ScrapingRequest {
  queries: string[];
  marketId?: string;
  marketDescription?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const encoder = new TextEncoder();

function streamText(controller: ReadableStreamDefaultController, text: string) {
  controller.enqueue(encoder.encode(`data: ${text}\n\n`));
}

function streamMessage(controller: ReadableStreamDefaultController, message: string) {
  streamText(controller, JSON.stringify({ type: "message", message }));
}

function streamError(controller: ReadableStreamDefaultController, message: string) {
  streamText(controller, JSON.stringify({ type: "error", message }));
}

function streamResults(controller: ReadableStreamDefaultController, results: SearchResult[]) {
  streamText(controller, JSON.stringify({ type: "results", data: results }));
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { queries, marketId, marketDescription } = await req.json() as ScrapingRequest;

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Valid queries array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Web scrape request:", { 
      queriesCount: queries.length, 
      marketId,
      marketDescription: marketDescription?.substring(0, 100)
    });

    // Create response stream
    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          streamMessage(controller, "Starting web search...");

          // Enhance queries with market information if available
          const enhancedQueries = queries.map(query => {
            // If the query doesn't already contain the marketId and we have one
            if (marketId && !query.includes(marketId)) {
              return `${query.trim()} ${marketId}`;
            }
            return query;
          });

          // If we have a market description, use it to create a better enhanced query
          if (marketDescription && marketId) {
            // Create a supabase client to fetch market data if needed
            const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
            const { data: marketData, error: marketError } = await supabase
              .from("markets")
              .select("question, description")
              .eq("id", marketId)
              .single();

            if (!marketError && marketData) {
              console.log("Found market data:", {
                id: marketId,
                question: marketData.question,
                description: marketData.description?.substring(0, 100)
              });
            }
          }

          let hasResults = false;
          const allResults: SearchResult[] = [];

          // Process each query with rate limiting
          for (let i = 0; i < enhancedQueries.length; i++) {
            const query = enhancedQueries[i];
            streamMessage(controller, `Processing query ${i+1}/${enhancedQueries.length}: ${query}`);
            
            try {
              // Call Brave Search API through our edge function
              const searchResponse = await fetch(
                new URL("/functions/v1/brave-search", SUPABASE_URL).href,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                  },
                  body: JSON.stringify({ query, count: 5 }),
                }
              );

              if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                streamError(controller, `Error processing query "${query}": Brave search failed: ${searchResponse.status} ${errorText}`);
                continue;
              }

              const searchData = await searchResponse.json();
              console.log(`Search results for query "${query}":`, { 
                resultsCount: searchData.web?.results?.length || 0 
              });

              if (!searchData.web?.results || searchData.web.results.length === 0) {
                console.log(`No results found for query: "${query}"`);
                continue;
              }

              // Process search results
              const results: SearchResult[] = [];

              for (const result of searchData.web.results) {
                try {
                  if (!result.url) continue;

                  // Attempt to fetch and extract content from the URL
                  const apiUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(result.url)}`;
                  
                  const contentResponse = await fetch(apiUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                  });

                  if (!contentResponse.ok) {
                    console.log(`Failed to fetch content from ${result.url}: ${contentResponse.status}`);
                    continue;
                  }

                  const html = await contentResponse.text();
                  
                  // Extract only the text content from HTML
                  const textContent = html
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                  // Limit content length 
                  const limitedContent = textContent.substring(0, 8000);
                  
                  results.push({
                    url: result.url,
                    title: result.title || '',
                    content: limitedContent,
                  });
                  
                  hasResults = true;
                } catch (error) {
                  console.log(`Error processing result from ${result.url}:`, error);
                }

                // Add a small delay between content requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
              }

              // Send a stream update with these results
              if (results.length > 0) {
                streamResults(controller, results);
                allResults.push(...results);
              }

              // Rate limiting between search queries
              if (i < enhancedQueries.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (error) {
              console.error(`Error processing query "${query}":`, error);
              streamError(controller, `Error processing query "${query}": ${error.message}`);
            }
          }

          if (!hasResults) {
            streamError(controller, "No results found for any queries");
          }

          streamText(controller, JSON.stringify({ type: "done" }));
          streamText(controller, "[DONE]");
        } catch (error) {
          console.error("Error in web scrape stream:", error);
          streamError(controller, `Web scrape error: ${error.message}`);
          streamText(controller, "[DONE]");
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error processing web scrape request:", error);
    
    return new Response(
      JSON.stringify({ error: `Web scrape error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
