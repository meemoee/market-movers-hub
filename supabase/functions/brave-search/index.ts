
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    // Verify request method
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 405
        }
      );
    }

    if (!BRAVE_API_KEY) {
      console.error("BRAVE_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "BRAVE_API_KEY is not configured" }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        }
      );
    }

    // Parse request body
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid or missing query parameter" }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400 
        }
      );
    }

    console.log(`Searching Brave for: "${query}"`);

    // Sanitize the query - remove special characters
    const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    
    // Set up parameters for Brave search
    const params = new URLSearchParams({
      q: sanitizedQuery,
      count: "10" // Request 10 results
    });
    
    const url = `${BRAVE_SEARCH_URL}?${params}`;
    console.log(`Brave search URL: ${url}`);
    
    // Make request to Brave Search API
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search API error: ${response.status}`, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Brave search API error: ${response.status}`,
          details: errorText
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status 
        }
      );
    }
    
    const data = await response.json();
    console.log(`Brave search returned data with status ${response.status}`);
    
    // Process and format results
    let results = [];
    
    if (data.web && data.web.results) {
      console.log(`Found ${data.web.results.length} results from Brave search`);
      
      data.web.results.forEach((item, i) => {
        if (item.url && item.url.startsWith('http')) {
          results.push({
            url: item.url,
            title: item.title || 'Brave Result',
            snippet: item.description || ''
          });
          console.log(`Result ${i+1}: URL=${item.url}, Title=${item.title}`);
        } else {
          console.log(`Skipping result ${i+1} with invalid URL: ${item.url}`);
        }
      });
    } else {
      console.log("No web results found in Brave search response");
      console.log("Response structure:", JSON.stringify(data, null, 2).substring(0, 200) + "...");
    }
    
    return new Response(
      JSON.stringify({ results }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Brave search error:", error.message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
