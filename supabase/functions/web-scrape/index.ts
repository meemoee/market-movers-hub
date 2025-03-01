
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  const encoder = new TextEncoder();
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();

  const writeSSE = async (event: string, data: any) => {
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    } catch (error) {
      console.error("Error writing to stream:", error);
    }
  };

  try {
    // Parse the request body
    const { queries } = await req.json();
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      throw new Error("Invalid queries parameter. Expected non-empty array.");
    }

    // Start the response with the SSE headers
    const response = new Response(responseStream.readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

    // Process each query in sequence and collect results
    const allResults = [];
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      await writeSSE("message", { message: `Processing query ${i+1}/${queries.length}: ${query}` });
      
      // Call the brave-search function for this query
      const braveResponse = await fetch(`${req.url.split('/web-scrape')[0]}/brave-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      
      if (!braveResponse.ok) {
        console.error(`Error from brave-search: ${braveResponse.status}`);
        const errorText = await braveResponse.text();
        console.error(`Brave search error details: ${errorText}`);
        await writeSSE("message", { 
          message: `Error searching for "${query}": ${braveResponse.status}` 
        });
        continue;
      }
      
      const braveData = await braveResponse.json();
      
      if (!braveData.results || braveData.results.length === 0) {
        console.log(`No results found for query: ${query}`);
        await writeSSE("message", { 
          message: `No results found for "${query}"` 
        });
        continue;
      }
      
      console.log(`Found ${braveData.results.length} results for query: ${query}`);
      await writeSSE("message", { 
        message: `Found ${braveData.results.length} results for "${query}"` 
      });
      
      // Process and scrape each result
      const scrapingResults = [];
      
      for (const result of braveData.results) {
        try {
          await writeSSE("message", { message: `Scraping content from ${result.url}` });
          
          // Fetch the webpage content
          const response = await fetch(result.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
          });

          if (!response.ok) {
            console.log(`Failed to fetch ${result.url}: ${response.status}`);
            continue;
          }

          const html = await response.text();
          
          // Parse the HTML using cheerio
          const $ = cheerio.load(html);
          
          // Remove script and style elements
          $("script, style").remove();
          
          // Get the visible text content
          let content = $("body")
            .text()
            .replace(/\s+/g, " ")
            .trim();
            
          // Limit content length
          content = content.slice(0, 5000);
          
          if (content) {
            scrapingResults.push({
              url: result.url,
              title: result.title,
              content: content
            });
            console.log(`Successfully scraped content from ${result.url}`);
          }
        } catch (error) {
          console.error(`Error scraping ${result.url}:`, error.message);
        }
      }
      
      // Add these results to the overall collection
      if (scrapingResults.length > 0) {
        await writeSSE("results", { type: "results", data: scrapingResults });
        allResults.push(...scrapingResults);
      }
    }
    
    // Send a final message with the total count
    await writeSSE("message", { 
      message: `Completed scraping with ${allResults.length} total results` 
    });
    
    // Signal the end of the stream
    await writeSSE("done", "[DONE]");
    await writer.close();
    
    return response;
  } catch (error) {
    console.error("Web scraping error:", error);
    
    try {
      await writeSSE("error", { 
        type: "error", 
        message: `Error: ${error.message}` 
      });
      await writer.close();
    } catch (streamError) {
      console.error("Error closing stream:", streamError);
    }
    
    // If we haven't started the stream yet, return a standard error response
    return new Response(
      JSON.stringify({ error: `Web scraping failed: ${error.message}` }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
