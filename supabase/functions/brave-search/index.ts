
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Brave Search API URL
const BRAVE_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";

interface SearchRequest {
  query: string;
  count?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, count = 10 } = await req.json() as SearchRequest;
    
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: "Invalid query provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Performing Brave search for: "${query}"`);

    const apiKey = Deno.env.get("BRAVE_API_KEY");
    
    if (!apiKey) {
      throw new Error("BRAVE_API_KEY environment variable is not set");
    }
    
    const response = await fetch(`${BRAVE_SEARCH_API_URL}?q=${encodeURIComponent(query)}&count=${count}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search API error: ${response.status} ${errorText}`);
      throw new Error(`Brave search failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log(`Successfully received Brave search results for: "${query}"`);
    
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`Error in brave-search function: ${error.message}`);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
