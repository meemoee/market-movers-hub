
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY');
    
    if (!BRAVE_API_KEY) {
      throw new Error('BRAVE_API_KEY is not set in environment variables');
    }

    // Parse the request body
    const { query, count = 10 } = await req.json();
    
    if (!query) {
      throw new Error('Query parameter is required');
    }

    console.log(`Executing Brave search for: "${query}"`);

    const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('count', count.toString());
    
    // Execute the search
    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search API error: ${response.status} - ${errorText}`);
      throw new Error(`Brave search API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.web || !data.web.results || !Array.isArray(data.web.results)) {
      console.error('Unexpected Brave search response format:', JSON.stringify(data));
      throw new Error('Unexpected Brave search response format');
    }

    const results = data.web.results.map((result: any): BraveSearchResult => ({
      title: result.title || '',
      url: result.url || '',
      description: result.description || '',
    }));

    console.log(`Retrieved ${results.length} search results for "${query}"`);
    
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Brave search error:', error.message);
    
    return new Response(JSON.stringify({ 
      error: `Brave search error: ${error.message}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
