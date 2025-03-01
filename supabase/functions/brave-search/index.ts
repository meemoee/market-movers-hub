
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

serve(async (req) => {
  console.log("Brave search function invoked");
  
  // Handle CORS for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      console.error("No query provided or invalid query format");
      return new Response(
        JSON.stringify({ error: 'No search query provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Searching Brave for: "${query}"`);
    
    const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY');
    if (!BRAVE_API_KEY) {
      console.error('BRAVE_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'BRAVE_API_KEY environment variable is not set' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Sanitize query - remove special characters
    const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    
    const params = new URLSearchParams({
      q: sanitizedQuery,
      count: '15'  // Increase result count from default (10)
    });
    
    const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Brave search error: ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const data = await response.json();
    
    // Process and filter web results
    if (!data.web || !data.web.results) {
      console.log(`No web results found for query: ${query}`);
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    const results = data.web.results.map((item) => ({
      url: item.url,
      title: item.title || '',
      description: item.description || ''
    }));
    
    console.log(`Found ${results.length} results for query: ${query}`);
    
    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Brave search error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
