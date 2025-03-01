
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");

interface SearchRequest {
  query: string;
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Check if we have an API key
    if (!BRAVE_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Brave Search API key is not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { query } = await req.json() as SearchRequest;
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing query parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Searching for: ${query}`);

    // Call Brave Search API
    const searchParams = new URLSearchParams({
      q: query,
      count: "10", // Number of results to return
    });

    const response = await fetch(`${BRAVE_SEARCH_URL}?${searchParams.toString()}`, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave Search API error: ${response.status} ${errorText}`);
      return new Response(
        JSON.stringify({
          error: `Brave Search API error: ${response.status}`,
          details: errorText
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    
    // Extract and format search results
    const results = data.web?.results || [];
    
    const formattedResults = results.map((result: any) => ({
      url: result.url,
      title: result.title,
      content: result.description,
    }));

    return new Response(
      JSON.stringify({ results: formattedResults }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
