
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");
const BRAVE_SEARCH_API = "https://api.search.brave.com/res/v1/web/search";

// Add required headers for Deno Deploy
const requestHeaders = {
  "Authorization": `Bearer ${BRAVE_API_KEY}`,
  "Accept": "application/json",
  "Content-Type": "application/json",
  "x-deno-subhost": "https://lfmkoismabbhujycnqpn.supabase.co",
  ...corsHeaders
};

interface QueryParams {
  q: string;
  count?: number;
  offset?: number;
  search_lang?: string;
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: {
    results: BraveSearchResult[];
  };
  query?: {
    original: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, count = 5 } = await req.json();

    console.log(`Processing Brave search for query: "${query}"`);

    if (!query || query.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    if (!BRAVE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Brave API key is not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Define query parameters
    const params: QueryParams = {
      q: query,
      count: count,
      search_lang: "en",
    };

    // Build the URL with query params
    const url = new URL(BRAVE_SEARCH_API);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value.toString());
    });

    // Make the request to Brave Search API
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: requestHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search API error: ${response.status} ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: `Brave search failed: ${response.status} ${errorText}`
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    const data: BraveSearchResponse = await response.json();

    if (!data.web || !data.web.results || data.web.results.length === 0) {
      console.log(`No results found for query: "${query}"`);
      return new Response(
        JSON.stringify({ 
          results: [], 
          message: `No results found for query: "${query}"` 
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Transform Brave search results to our format
    const results = data.web.results.map((result) => ({
      url: result.url,
      title: result.title,
      content: result.description,
    }));

    console.log(`Found ${results.length} results for query: "${query}"`);

    return new Response(JSON.stringify({ results }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Error processing Brave search:", error);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});
