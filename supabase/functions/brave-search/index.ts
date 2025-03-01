
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      throw new Error("No valid query provided");
    }

    console.log(`Processing search for query: "${query}"`);

    if (!BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY is not set");
    }

    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.append('q', query);
    url.searchParams.append('count', '10');
    url.searchParams.append('search_lang', 'en');

    console.log(`Fetching search results from: ${url.toString()}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Brave search API error:', errorText, 'Status:', response.status);
      throw new Error(`Brave search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data || !data.web || !Array.isArray(data.web.results)) {
      console.error('Unexpected API response structure:', JSON.stringify(data));
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Received ${data.web.results.length} search results`);

    // Transform the search results into a simpler format
    const results = data.web.results.map(result => ({
      url: result.url,
      title: result.title,
      content: result.description || ''
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ error: error.message, results: [] }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
