
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { SSEMessage } from "./types.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { queries } = await req.json();
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new Error("No queries provided");
    }

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          let allResults = [];
          let atleastOneQuerySucceeded = false;

          for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            const message: SSEMessage = {
              type: 'message',
              message: `Processing query ${i+1}/${queries.length}: ${query}`
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));

            try {
              // Execute the search using brave-search function
              console.log(`Searching for: "${query}"`);
              const searchResponse = await fetch(`${SUPABASE_URL}/functions/v1/brave-search`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query })
              });
              
              if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                console.error(`Error response from brave-search: ${errorText}`);
                const errorMessage: SSEMessage = {
                  type: 'message',
                  message: `Error fetching search results for query "${query}": ${searchResponse.status}`
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
                continue;
              }
              
              const searchData = await searchResponse.json();
              console.log(`Brave search: Received response`, searchData);
              
              if (!searchData.results || !Array.isArray(searchData.results)) {
                console.error('Invalid response structure from brave-search:', searchData);
                const errorMessage: SSEMessage = {
                  type: 'message',
                  message: `Error processing query "${query}": Invalid response from search API`
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
                continue;
              }
              
              const searchResults = searchData.results;
              console.log(`Brave search: Received ${searchResults.length} results`);
              
              if (searchResults && searchResults.length > 0) {
                atleastOneQuerySucceeded = true;
                allResults = [...allResults, ...searchResults];
                
                // Send the results for this query
                const resultMessage: SSEMessage = {
                  type: 'results',
                  data: searchResults
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultMessage)}\n\n`));
              } else {
                const noResultsMessage: SSEMessage = {
                  type: 'message',
                  message: `No results found for query "${query}"`
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(noResultsMessage)}\n\n`));
              }
            } catch (error) {
              console.error(`Error processing query "${query}":`, error);
              const errorMessage: SSEMessage = {
                type: 'message',
                message: `Error processing query "${query}": ${error.message}`
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
            }
          }

          if (!atleastOneQuerySucceeded || allResults.length === 0) {
            const noContentMessage: SSEMessage = {
              type: 'message',
              message: `No content was collected from any of the ${queries.length} queries.`
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(noContentMessage)}\n\n`));
          }

          const completedMessage: SSEMessage = {
            type: 'message',
            message: 'Search Completed'
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completedMessage)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          console.error('Stream error:', error);
          const errorMessage: SSEMessage = {
            type: 'error',
            message: `Error in stream: ${error.message}`
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
