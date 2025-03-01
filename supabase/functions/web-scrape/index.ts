
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ResearchResult } from './types.ts';

// Replace with your actual Brave Search API settings
const BRAVE_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";

interface SearchQuery {
  queries: string[];
  marketId?: string;
  marketDescription?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { queries, marketId, marketDescription } = await req.json() as SearchQuery;
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid queries provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Starting web scraping for market: ${marketId || 'Unknown'}`);
    console.log(`Market description: ${marketDescription?.substring(0, 100) || 'None'}`);
    console.log(`Search queries: ${JSON.stringify(queries)}`);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start: async (controller) => {
        // Send message for each query
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          const message = JSON.stringify({
            type: 'message',
            message: `Processing query ${i+1}/${queries.length}: ${query}`
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          
          try {
            const results = await searchBrave(query);
            
            if (results.length > 0) {
              // Send results
              const resultsMessage = JSON.stringify({
                type: 'results',
                data: results
              });
              controller.enqueue(encoder.encode(`data: ${resultsMessage}\n\n`));
            } else {
              // No results for this query
              const errorMessage = JSON.stringify({
                type: 'message',
                message: `No results found for query: "${query}"`
              });
              controller.enqueue(encoder.encode(`data: ${errorMessage}\n\n`));
            }
            
          } catch (error) {
            console.error(`Search error for query "${query}": ${error.message}`);
            const errorMessage = JSON.stringify({
              type: 'error',
              message: `Error processing query "${query}": ${error.message}`
            });
            controller.enqueue(encoder.encode(`data: ${errorMessage}\n\n`));
          }
        }
        
        // Check if we found any results at all
        if (!foundAnyResults) {
          const noResultsMessage = JSON.stringify({
            type: 'error',
            message: 'No results found for any queries'
          });
          controller.enqueue(encoder.encode(`data: ${noResultsMessage}\n\n`));
        }
        
        // Complete the stream
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    console.error('Error in web-scrape function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// Track if we found any results across all queries
let foundAnyResults = false;

async function searchBrave(query: string): Promise<ResearchResult[]> {
  const apiKey = Deno.env.get("BRAVE_API_KEY");
  
  if (!apiKey) {
    throw new Error("BRAVE_API_KEY env variable is not set");
  }
  
  try {
    console.log(`Sending Brave search request for query: ${query}`);
    
    const response = await fetch(`${BRAVE_SEARCH_API_URL}?q=${encodeURIComponent(query)}&count=10`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave search failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.web || !data.web.results) {
      console.log('No web results found in Brave Search response');
      return [];
    }
    
    // Transform results to our format
    const results: ResearchResult[] = data.web.results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.description || ''
    }));
    
    console.log(`Found ${results.length} results for query: ${query}`);
    
    if (results.length > 0) {
      foundAnyResults = true;
    }
    
    return results;
  } catch (error) {
    console.error(`Error in Brave search: ${error.message}`);
    throw error;
  }
}
