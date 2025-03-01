
import { corsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY") || "";

interface BraveSearchParams {
  q: string;
  count?: number;
  offset?: number;
}

export async function searchBrave(query: string, count: number = 10): Promise<any> {
  // Truncate query to 390 characters (below the 400 limit)
  const truncatedQuery = query.length > 390 ? query.substring(0, 390) + "..." : query;
  
  const params: BraveSearchParams = {
    q: truncatedQuery,
    count
  };
  
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });

  try {
    console.log(`Searching Brave for: ${truncatedQuery.substring(0, 50)}...`);
    
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
        "X-Country-Code": "US"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search failed: ${response.status} ${errorText}`);
      throw new Error(`Brave search failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`Received ${data.web?.results?.length || 0} search results`);
    return data;
  } catch (error) {
    console.error("Error searching Brave:", error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { query, count } = await req.json();
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const results = await searchBrave(query, count || 10);
    
    return new Response(JSON.stringify(results), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
