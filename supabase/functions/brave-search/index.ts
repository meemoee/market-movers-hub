
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const braveApiUrl = "https://api.search.brave.com/res/v1/web/search";

interface BraveSearchParams {
  q: string;
  count?: number;
  offset?: number;
  search_lang?: string;
  country?: string;
  safe_search?: string;
  freshness?: string;
}

interface SearchRequest {
  query: string;
  count?: number;
  offset?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");
    if (!BRAVE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "BRAVE_API_KEY is not set in environment" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const requestData: SearchRequest = await req.json();
    const { query, count = 5, offset = 0 } = requestData;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Executing Brave search for query: "${query}"`);

    const params: BraveSearchParams = {
      q: query,
      count: count,
      offset: offset,
      search_lang: "en",
      country: "US",
      safe_search: "moderate",
    };

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    const url = `${braveApiUrl}?${searchParams.toString()}`;

    // Make the request to Brave Search API with proper headers
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
        "x-deno-subhost": "brave-search", // Required header for Deno Deploy
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave API error ${response.status}: ${errorText}`);
      
      return new Response(
        JSON.stringify({ 
          error: `Brave search failed: ${response.status} ${errorText}`,
          status: response.status
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    console.log(`Brave search success: Found ${data.web?.results?.length || 0} results`);

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Brave search error:", error.message);
    
    return new Response(
      JSON.stringify({ error: `Brave search error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
