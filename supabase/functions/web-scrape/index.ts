
import { corsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SearchResult } from "./types.ts";

// Add a delay function to help with rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSearchResults(query: string): Promise<SearchResult[]> {
  try {
    // Truncate long queries
    const truncatedQuery = query.length > 390 ? query.substring(0, 390) + "..." : query;
    
    // Call the brave-search function
    const response = await fetch(
      new URL("/functions/v1/brave-search", Deno.env.get("SUPABASE_URL")).href,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ query: truncatedQuery, count: 10 }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave search failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.web?.results || data.web.results.length === 0) {
      return [];
    }

    // Extract and return search results
    return data.web.results.map((result: any) => ({
      title: result.title,
      url: result.url,
      description: result.description
    }));
  } catch (error) {
    console.error(`Error fetching search results for query: ${query.substring(0, 50)}...`, error);
    return [];
  }
}

async function scrapeWebContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch content: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("Not an HTML document");
    }

    const html = await response.text();
    // Extract text content from HTML - simple version
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Return a portion of the content for performance
    const maxChars = 5000;
    return textContent.length > maxChars 
      ? textContent.substring(0, maxChars) + "..." 
      : textContent;
  } catch (error) {
    console.error(`Error scraping URL ${url}:`, error);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { queries, marketId, marketDescription } = await req.json();
        
        if (!queries || !Array.isArray(queries) || queries.length === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Invalid or missing queries" })}\n\n`));
          controller.close();
          return;
        }

        console.log(`Received ${queries.length} search queries for market ${marketId}`);
        
        // Process queries with appropriate delays to avoid rate limiting
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          
          // Create shorter search queries by extracting key information
          let searchQuery = query;
          
          // For very long queries, create a more focused search query
          if (query.length > 400) {
            // Extract market-specific keywords from the description
            const marketKeywords = marketDescription
              ? marketDescription.split(/\s+/).filter(word => 
                  word.length > 4 && 
                  !["market", "resolve", "this", "will", "that", "with", "have"].includes(word.toLowerCase())
                ).slice(0, 6).join(" ")
              : "";
              
            // Create a more focused query
            searchQuery = marketKeywords || query.substring(0, 100);
          }
          
          // Stream progress
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "message", 
            message: `Processing query ${i+1}/${queries.length}: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}` 
          })}\n\n`));
          
          // Add delay between requests to avoid rate limiting
          if (i > 0) {
            await delay(1100); // Wait slightly more than 1 second between requests
          }
          
          try {
            const searchResults = await fetchSearchResults(searchQuery);
            
            if (searchResults.length === 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: "error", 
                message: `No search results found for query "${searchQuery.substring(0, 50)}${searchQuery.length > 50 ? '...' : ''}"` 
              })}\n\n`));
              continue;
            }
            
            const webResults: SearchResult[] = [];
            
            // Process each search result
            for (let j = 0; j < Math.min(searchResults.length, 3); j++) {
              const result = searchResults[j];
              
              try {
                // Add delay between content scraping to avoid being rate limited
                if (j > 0) await delay(500);
                
                const content = await scrapeWebContent(result.url);
                
                if (content) {
                  webResults.push({
                    url: result.url,
                    title: result.title,
                    content: content
                  });
                }
              } catch (error) {
                console.error(`Error processing search result ${result.url}:`, error);
              }
            }
            
            if (webResults.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: "results", 
                data: webResults 
              })}\n\n`));
            }
          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: "error", 
              message: `Error processing query "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}": ${error.message}` 
            })}\n\n`));
          }
        }
        
        const allResultsCount = 0; // Will be calculated in the frontend
        
        if (allResultsCount === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "error", 
            message: "No results found for any queries" 
          })}\n\n`));
        }
        
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: "error", 
          message: `Server error: ${error.message}` 
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
      "Connection": "keep-alive"
    }
  });
});
