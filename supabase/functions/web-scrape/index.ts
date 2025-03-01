
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface WebScrapeRequest {
  queries: string[];
}

interface SearchResult {
  url: string;
  title: string;
  content: string;
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { queries } = await req.json() as WebScrapeRequest;
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid queries parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Stream response setup
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Function to send messages to the stream
    const sendMessage = async (message: string) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ message })}\n\n`));
    };

    // Function to send results to the stream
    const sendResults = async (data: any) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'results', data })}\n\n`));
    };

    // Start processing in the background
    (async () => {
      try {
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          
          await sendMessage(`Processing query ${i+1}/${queries.length}: ${query}`);
          
          // Call Brave Search API via our edge function
          const response = await fetch(new URL('/functions/v1/brave-search', req.url).href, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Forward auth headers if needed
              ...(req.headers.get('Authorization') ? { 'Authorization': req.headers.get('Authorization')! } : {})
            },
            body: JSON.stringify({ query })
          });
          
          if (!response.ok) {
            console.error(`Error from brave-search function: ${response.status}`);
            const errorText = await response.text();
            console.error(`Error details: ${errorText}`);
            await sendMessage(`Error searching for "${query}": ${response.status}`);
            continue;
          }
          
          const searchData = await response.json();
          
          if (!searchData.results || !Array.isArray(searchData.results) || searchData.results.length === 0) {
            await sendMessage(`No results found for "${query}"`);
            continue;
          }
          
          // Format the results and send them to the client
          const formattedResults: SearchResult[] = searchData.results.map((result: any) => ({
            url: result.url,
            content: result.description || result.content || result.snippet || "",
            title: result.title || "Search Result"
          }));
          
          await sendResults(formattedResults);
          await sendMessage(`Found ${formattedResults.length} results for "${query}"`);
        }
        
        // Close the stream
        await writer.close();
      } catch (error) {
        console.error("Error in stream processing:", error);
        await sendMessage(`Error: ${error.message}`);
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({
        error: `Error processing request: ${error.message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
