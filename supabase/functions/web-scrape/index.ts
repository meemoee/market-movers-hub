
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { SearchResult } from "./types.ts";

const encoder = new TextEncoder();

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { queries, marketId, marketDescription } = await req.json();

    // Only set up server-sent events if the connection supports it
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Function to send data in the correct SSE format
    const sendEvent = async (event: any) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      await writer.write(encoder.encode(data));
    };

    // Start processing in the background
    (async () => {
      try {
        await sendEvent({ 
          type: "message", 
          message: `Starting web search with ${queries.length} queries for market: ${marketId}` 
        });

        const allResults: SearchResult[] = [];

        // Process each query
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          
          await sendEvent({ 
            type: "message", 
            message: `Processing query ${i + 1}/${queries.length}: ${query}` 
          });

          try {
            // Use relative URL for function invocation within Supabase
            const braveSearchResponse = await fetch(
              "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/brave-search",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": req.headers.get("Authorization") || "",
                },
                body: JSON.stringify({ 
                  query,
                  count: 5 // Limit to top 5 results per query to reduce rate limits
                }),
              }
            );

            if (!braveSearchResponse.ok) {
              const errorText = await braveSearchResponse.text();
              throw new Error(`Brave search failed: ${braveSearchResponse.status} ${errorText}`);
            }

            const searchData = await braveSearchResponse.json();
            
            if (!searchData.web || !searchData.web.results || searchData.web.results.length === 0) {
              await sendEvent({ 
                type: "message", 
                message: `No results found for query: "${query}"` 
              });
              continue;
            }

            // Extract and process the top results
            const results = searchData.web.results.slice(0, 5).map((result: any) => ({
              url: result.url,
              title: result.title,
              content: result.description,
            }));

            allResults.push(...results);
            
            await sendEvent({ 
              type: "results", 
              data: results 
            });
            
            // Add a delay between queries to avoid rate limiting
            if (i < queries.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            await sendEvent({ 
              type: "error", 
              message: `Error processing query "${query}": ${error.message}` 
            });
          }
        }

        if (allResults.length === 0) {
          await sendEvent({ 
            type: "error", 
            message: "No results found for any queries" 
          });
        }

        await sendEvent({ type: "done" });
        writer.close();
      } catch (error) {
        await sendEvent({ 
          type: "error", 
          message: `Unexpected error: ${error.message}` 
        });
        writer.close();
      }
    })();

    return new Response(stream.readable, { headers });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
