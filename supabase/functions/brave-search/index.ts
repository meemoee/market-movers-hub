
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");
const BRAVE_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY is not configured");
    }

    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: "Missing or invalid query parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Searching Brave for: "${query}"`);

    const searchParams = new URLSearchParams({
      q: query,
      count: "10", // Number of results to return
      search_lang: "en",
    });

    const response = await fetch(`${BRAVE_SEARCH_API_URL}?${searchParams.toString()}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`Brave Search API error: ${response.status}`);
      const errorText = await response.text();
      console.error(`Error details: ${errorText}`);
      throw new Error(`Brave Search API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Received ${data.web?.results?.length || 0} results from Brave Search`);

    // Format the results
    const results = data.web?.results?.map((result: any) => ({
      url: result.url,
      title: result.title,
      description: result.description,
      content: result.description // Use description as content since Brave doesn't provide full content
    })) || [];

    return new Response(
      JSON.stringify({ results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in Brave search:", error);
    return new Response(
      JSON.stringify({
        error: `Error in Brave search: ${error.message}`,
        results: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
