
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY") || "";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: new Headers(corsHeaders),
    });
  }

  // Check if the request has an appropriate method
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const { query, count = 10 } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: "Query is required" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (!BRAVE_API_KEY) {
      console.error("BRAVE_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Search API configuration error" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Add the required x-deno-subhost header with a valid value
    const requestHeaders = {
      "Accept": "application/json",
      "x-deno-subhost": "supabase.functions.lfmkoismabbhujycnqpn",
      "X-Subscription-Token": BRAVE_API_KEY,
    };

    console.log(`Searching Brave for: "${query}"`);
    
    const searchUrl = new URL("https://api.search.brave.com/res/v1/web/search");
    searchUrl.searchParams.append("q", query);
    searchUrl.searchParams.append("count", count.toString());
    
    const searchResponse = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: requestHeaders,
    });

    if (!searchResponse.ok) {
      const errorBody = await searchResponse.text();
      console.error(`Brave search failed: ${searchResponse.status} ${errorBody}`);
      return new Response(
        JSON.stringify({ 
          error: `Brave search failed: ${searchResponse.status} ${errorBody}` 
        }),
        {
          status: searchResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await searchResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error processing search request:", error.message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
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
