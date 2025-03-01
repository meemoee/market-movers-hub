
import { corsHeaders } from '../_shared/cors.ts';

interface BraveSearchParams {
  query: string;
  count?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY');
    if (!BRAVE_API_KEY) {
      throw new Error('BRAVE_API_KEY is not set');
    }

    const { query, count = 10 } = await req.json() as BraveSearchParams;
    console.log(`Brave search: Searching for "${query}"`);
    
    if (!query) {
      throw new Error('Query parameter is required');
    }

    // Sanitize query
    const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    
    const params = new URLSearchParams({
      q: sanitizedQuery,
      count: count.toString(),
    });
    
    const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
    const url = `${BRAVE_SEARCH_URL}?${params}`;
    
    console.log(`Brave search: Making request to ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave API error (${response.status}): ${errorText}`);
      throw new Error(`Brave search API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`Brave search: Received ${data?.web?.results?.length || 0} results`);
    
    // Format results
    const results = data?.web?.results?.map((item: any) => ({
      url: item.url,
      title: item.title || 'Brave Result',
      snippet: item.description || ''
    })) || [];
    
    console.log(`Brave search: Formatted ${results.length} results`);
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`Brave search error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
