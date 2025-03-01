
import { corsHeaders } from '../_shared/cors.ts';
import { SSEMessage } from './types';

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");

Deno.serve(async (req) => {
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
              // Execute the search
              const searchResults = await searchWeb(query);
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
                const errorMessage: SSEMessage = {
                  type: 'message',
                  message: `No results found for query "${query}"`
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
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

async function searchWeb(query: string) {
  if (!BRAVE_API_KEY) {
    throw new Error("BRAVE_API_KEY is not set");
  }

  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.append('q', query);
  url.searchParams.append('count', '10');
  url.searchParams.append('search_lang', 'en');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY,
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Brave search API error:', errorText);
    throw new Error(`Brave search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Add proper error handling and validation for the API response
  if (!data || !data.web || !Array.isArray(data.web.results)) {
    console.error('Unexpected API response structure:', JSON.stringify(data));
    return []; // Return empty array instead of throwing error
  }

  // Extract and transform the search results
  return data.web.results.map(result => ({
    url: result.url,
    title: result.title,
    content: result.description || ''
  }));
}
