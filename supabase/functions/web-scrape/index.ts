
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { SearchResult } from "./types.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY") || "";

interface WebScrapeRequest {
  queries: string[];
  marketDescription?: string;
}

interface SearchResultResponse {
  type: "results";
  data: SearchResult[];
}

interface MessageResponse {
  type: "message";
  message: string;
}

interface ErrorResponse {
  type: "error";
  message: string;
}

type StreamResponse = SearchResultResponse | MessageResponse | ErrorResponse;

async function processQuery(query: string, controller: ReadableStreamController<Uint8Array>): Promise<SearchResult[]> {
  try {
    const encoder = new TextEncoder();
    
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "message", message: `Processing query: ${query}` })}\n\n`));
    
    // Call Brave search API
    const braveResponse = await fetch("https://api.search.brave.com/res/v1/web/search", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
      signal: AbortSignal.timeout(15000),
      keepalive: true,
      cache: "no-cache",
      redirect: "follow",
      body: null,
      params: {
        q: query,
        count: 20,
        search_lang: "en",
        safesearch: "moderate",
      },
    });

    if (!braveResponse.ok) {
      const errorText = await braveResponse.text();
      throw new Error(`Brave search failed: ${braveResponse.status} ${errorText}`);
    }

    const braveData = await braveResponse.json();
    
    if (!braveData?.web?.results || !Array.isArray(braveData.web.results)) {
      console.error("No results found in Brave search response");
      return [];
    }
    
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
      type: "message", 
      message: `Found ${braveData.web.results.length} results for "${query}"` 
    })}\n\n`));
    
    const results: SearchResult[] = [];
    
    // Process search results
    for (const result of braveData.web.results) {
      if (!result.url) continue;
      
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
        type: "message", 
        message: `Processing content from ${result.url}` 
      })}\n\n`));
      
      try {
        // Fetch the webpage content
        const pageResponse = await fetch(result.url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "text/html",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        
        if (!pageResponse.ok) {
          console.warn(`Failed to fetch ${result.url}: ${pageResponse.status}`);
          continue;
        }
        
        const contentType = pageResponse.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          console.warn(`Skipping non-HTML content: ${result.url}`);
          continue;
        }
        
        const html = await pageResponse.text();
        
        // Extract text content from HTML
        const textContent = extractText(html);
        
        if (textContent && textContent.length > 100) {
          results.push({
            url: result.url,
            title: result.title || "",
            content: textContent.slice(0, 10000), // Limit content length
          });
          
          // Push search results to stream periodically
          if (results.length % 3 === 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: "results", 
              data: results.slice(-3) 
            })}\n\n`));
          }
        }
      } catch (error) {
        console.warn(`Error processing ${result.url}:`, error);
      }
    }
    
    // Return any remaining results
    const remainingResults = results.length % 3;
    if (remainingResults > 0) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
        type: "results", 
        data: results.slice(-remainingResults) 
      })}\n\n`));
    }
    
    return results;
  } catch (error) {
    console.error(`Error processing query "${query}":`, error);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
      type: "error", 
      message: `Error processing query "${query}": ${error instanceof Error ? error.message : 'Unknown error'}` 
    })}\n\n`));
    return [];
  }
}

function extractText(html: string): string {
  // Very basic HTML content extraction
  // Remove scripts, styles, and HTML tags
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    const requestData: WebScrapeRequest = await req.json();
    
    if (!requestData.queries || !Array.isArray(requestData.queries) || requestData.queries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Queries array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Create a streaming response
    const stream = new ReadableStream({
      start: async (controller) => {
        const encoder = new TextEncoder();
        
        try {
          let allResults: SearchResult[] = [];
          
          for (let i = 0; i < requestData.queries.length; i++) {
            const query = requestData.queries[i];
            
            if (!query || typeof query !== "string" || query.trim() === "") {
              continue;
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: "message", 
              message: `Processing query ${i+1}/${requestData.queries.length}: ${query}` 
            })}\n\n`));
            
            const results = await processQuery(query, controller);
            allResults = [...allResults, ...results];
          }
          
          if (allResults.length === 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: "error", 
              message: "No results found for any queries" 
            })}\n\n`));
          }
          
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "error", 
            message: `Stream processing error: ${error instanceof Error ? error.message : 'Unknown error'}` 
          })}\n\n`));
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
    console.error("Request processing error:", error);
    return new Response(
      JSON.stringify({ 
        error: `Request processing error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
