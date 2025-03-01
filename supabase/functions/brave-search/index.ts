
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY environment variable is required");
    }

    const { query } = await req.json();
    
    if (!query || typeof query !== "string") {
      throw new Error("Query parameter must be provided as a string");
    }

    // Sanitize the query - remove special characters
    const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    
    const params = new URLSearchParams({
      q: sanitizedQuery,
      count: "10" // Number of results to return
    });
    
    const url = `${BRAVE_SEARCH_URL}?${params}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Brave search API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Process and format results
    let results = [];
    
    if (data.web && data.web.results) {
      data.web.results.forEach((item) => {
        if (item.url && item.url.startsWith('http')) {
          results.push({
            url: item.url,
            name: item.title || 'Brave Result',
            snippet: item.description || ''
          });
        }
      });
    }

    return new Response(
      JSON.stringify(results),
      { 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  } catch (error) {
    console.error("Brave search error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});
