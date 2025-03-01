
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  query: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("BRAVE_API_KEY");
    if (!apiKey) {
      throw new Error("Brave API key not configured");
    }

    const { query } = await req.json() as RequestBody;
    
    if (!query || typeof query !== 'string') {
      throw new Error("Invalid query");
    }
    
    // Ensure the query isn't too long for the Brave API
    const truncatedQuery = query.substring(0, 350);
    console.log(`Making Brave search request for: ${truncatedQuery}`);
    
    // URL encode the query
    const encodedQuery = encodeURIComponent(truncatedQuery);
    
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=10`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      // Add detailed error information
      const errorStatus = response.status;
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        errorBody = 'Could not read error response';
      }
      
      console.error(`Brave search API error: ${errorStatus} ${errorBody}`);
      
      // Provide useful message based on status code
      if (errorStatus === 429) {
        throw new Error(`429 ${errorBody}`);
      } else if (errorStatus === 401) {
        throw new Error("Invalid API key or authorization issue");
      } else {
        throw new Error(`Search API error: ${errorStatus} ${errorBody}`);
      }
    }

    const data = await response.json();
    
    // Add logging about the response
    console.log(`Received ${data?.webPages?.value?.length || 0} results from Brave search`);
    
    // Return the data
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Brave search error:", error);
    
    return new Response(
      JSON.stringify({ error: error.message || "An error occurred in the Brave search function" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
