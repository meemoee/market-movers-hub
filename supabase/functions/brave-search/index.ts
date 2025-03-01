
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");

serve(async (req) => {
  console.log("Brave search function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!BRAVE_API_KEY) {
      console.error("BRAVE_API_KEY environment variable is required");
      throw new Error("BRAVE_API_KEY environment variable is required");
    }

    const payload = await req.json();
    console.log("Request payload:", payload);
    
    const { query } = payload;
    
    if (!query || typeof query !== "string") {
      console.error("Query parameter must be provided as a string");
      throw new Error("Query parameter must be provided as a string");
    }

    console.log("Searching Brave for:", query);

    // Sanitize the query - remove special characters
    const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    console.log("Sanitized query:", sanitizedQuery);
    
    const params = new URLSearchParams({
      q: sanitizedQuery,
      count: "10" // Number of results to return
    });
    
    const url = `${BRAVE_SEARCH_URL}?${params}`;
    console.log("Brave search URL:", url);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Brave search API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Brave search response received", { 
      web_results_count: data.web?.results?.length || 0 
    });
    
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

    console.log(`Found ${results.length} valid results from Brave search`);

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
