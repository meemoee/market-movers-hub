
import { corsHeaders } from "../_shared/cors.ts";
import { ScrapingResult } from "./types.ts";

// Sleep function to prevent rate limiting
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  
  // Process the request in a separate async function
  (async () => {
    try {
      const { queries, marketId, marketDescription } = await req.json();
      
      console.log("Web scrape request received:");
      console.log(`- Market ID: ${marketId}`);
      console.log(`- Market Description: ${marketDescription?.substring(0, 100)}${marketDescription?.length > 100 ? '...' : ''}`);
      console.log(`- Queries: ${JSON.stringify(queries)}`);

      if (!queries || !Array.isArray(queries) || queries.length === 0) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "No valid queries provided" })}\n\n`));
        await writer.close();
        return;
      }

      // Send initial message
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "message", message: "Starting web search..." })}\n\n`));

      const allResults: ScrapingResult[] = [];
      
      // Process each query with a delay between requests
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        
        if (!query || typeof query !== 'string' || query.trim() === '') {
          continue;
        }
        
        // Send progress message
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: "message", message: `Processing query ${i + 1}/${queries.length}: ${query}` })}\n\n`)
        );

        try {
          // Call the Brave search function via Supabase Edge Function
          const response = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/brave-search`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                "x-deno-subhost": "https://lfmkoismabbhujycnqpn.supabase.co",
              },
              body: JSON.stringify({ query, count: 5 }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Brave search API error: ${response.status} ${errorText}`);
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: `Error processing query "${query}": Brave search failed: ${response.status} ${errorText}` })}\n\n`)
            );
            continue;
          }

          const data = await response.json();
          
          if (data.error) {
            console.error(`Brave search API error: ${data.error}`);
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: `Error processing query "${query}": ${data.error}` })}\n\n`)
            );
            continue;
          }
          
          if (!data.results || data.results.length === 0) {
            console.log(`No results found for query: ${query}`);
            continue;
          }

          // Map results to our format
          const results: ScrapingResult[] = data.results.map((result: any) => ({
            url: result.url,
            title: result.title,
            content: result.content,
          }));

          // Add to all results
          allResults.push(...results);

          // Send results back to client
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "results", data: results })}\n\n`)
          );
          
          // Delay between requests to avoid rate limiting
          if (i < queries.length - 1) {
            await sleep(1000);
          }
        } catch (error) {
          console.error(`Error processing query "${query}":`, error);
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: `Error processing query "${query}": ${error.message}` })}\n\n`)
          );
        }
      }

      if (allResults.length === 0) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "No results found for any queries" })}\n\n`)
        );
      }

      // Send done message
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      await writer.write(encoder.encode(`data: [DONE]\n\n`));
    } catch (error) {
      console.error("Error in web-scrape function:", error);
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "error", message: `Server error: ${error.message}` })}\n\n`)
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });
});

const encoder = new TextEncoder();
