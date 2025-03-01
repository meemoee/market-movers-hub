
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SSEMessage } from "./types.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { queries } = await req.json();
  
  if (!queries || !Array.isArray(queries) || queries.length === 0) {
    return new Response(JSON.stringify({ error: "No valid queries provided" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  console.log(`Received ${queries.length} queries to search`);

  // Setup Server-Sent Events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          console.log(`Processing query ${i+1}/${queries.length}: ${query}`);
          
          // Send a message that we're processing this query
          const message: SSEMessage = {
            type: 'message',
            message: `Processing query ${i+1}/${queries.length}: ${query}`
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
          
          try {
            // Call Brave Search
            const results = await searchWeb(query);
            
            if (results && results.length > 0) {
              // Send the results
              const resultsMessage: SSEMessage = {
                type: 'results',
                data: results
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultsMessage)}\n\n`));
            } else {
              console.log(`No results found for query: ${query}`);
            }
          } catch (error) {
            console.error(`Error processing query "${query}":`, error);
            const errorMessage: SSEMessage = {
              type: 'error',
              message: `Error processing query "${query}": ${error.message}`
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
          }
        }
        
        // Check if we got any content
        if (!contentCollected) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'message',
            message: `No content was collected from any of the ${queries.length} queries.`
          })}\n\n`));
        }
        
        // Send a completion message
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'message',
          message: 'Search Completed'
        })}\n\n`));
        
        // Signal the end of the stream
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (error) {
        console.error("Stream processing error:", error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          message: `Stream error: ${error.message}`
        })}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    }
  });

  let contentCollected = false;
  
  async function searchWeb(query: string) {
    try {
      console.log(`Searching for: ${query}`);
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/brave-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error from brave-search function: ${response.status}`, errorText);
        throw new Error(`Error fetching search results for query "${query}": ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.error(`Search error for query "${query}":`, data.error);
        throw new Error(data.error);
      }
      
      if (!data.results || !Array.isArray(data.results)) {
        console.error(`No results array in response for query "${query}":`, data);
        return [];
      }
      
      console.log(`Retrieved ${data.results.length} search results for "${query}"`);
      
      if (data.results.length > 0) {
        contentCollected = true;
      }
      
      return data.results.map((result: any) => ({
        url: result.url,
        title: result.title,
        content: result.content,
      }));
    } catch (error) {
      console.error(`Search error for query "${query}":`, error);
      throw error;
    }
  }

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
});
