
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

interface WebSearchQuery {
  queries: string[];
}

interface SearchResult {
  url: string;
  title?: string;
  content: string;
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/search';
const MAX_RESULTS_PER_QUERY = 3;
const MAX_TOTAL_RESULTS = 15;

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { queries } = await req.json() as WebSearchQuery;

    // Early validation
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      console.error('Invalid request: missing or empty queries array');
      return new Response(
        JSON.stringify({ error: 'Invalid request: queries must be a non-empty array' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY not set in environment variables');
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Setup SSE response
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Start the stream
    const responseInit = {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    };

    // Start search process in background
    searchForQueries(queries, writer).catch(error => {
      console.error('Error in search process:', error);
      writer.write(encoder.encode(`data: {"type":"error","message":"${error.message}"}\n\n`));
      writer.close();
    });

    return new Response(stream.readable, responseInit);
  } catch (error) {
    console.error('Server error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function searchForQueries(queries: string[], writer: WritableStreamDefaultWriter<Uint8Array>) {
  const encoder = new TextEncoder();
  const filteredQueries = queries.filter(q => q && typeof q === 'string' && q.replace(/\[.*?\]/g, '').trim() !== '');
  
  // Initial message
  await writer.write(encoder.encode(`data: {"type":"message","message":"Starting web research..."}\n\n`));
  
  const allResults: SearchResult[] = [];
  let totalResultsCount = 0;

  for (let i = 0; i < filteredQueries.length && totalResultsCount < MAX_TOTAL_RESULTS; i++) {
    const query = filteredQueries[i].replace(/\[.*?\]/g, '').trim();
    if (!query) continue;

    // Send message about current query
    await writer.write(
      encoder.encode(`data: {"type":"message","message":"Processing query ${i + 1}/${Math.min(filteredQueries.length, 3)}: ${query}"}\n\n`)
    );
    
    try {
      // Use OpenRouter's search API
      const searchResults = await searchOpenRouter(query);
      
      if (searchResults && searchResults.length > 0) {
        // Limit results per query
        const limitedResults = searchResults.slice(0, MAX_RESULTS_PER_QUERY);
        allResults.push(...limitedResults);
        totalResultsCount += limitedResults.length;
        
        // Send these results to the client
        await writer.write(
          encoder.encode(`data: {"type":"results","data":${JSON.stringify(limitedResults)}}\n\n`)
        );
      }
      
      // Stop after 3 queries to avoid too many requests
      if (i >= 2) break;
      
    } catch (error) {
      console.error(`Error searching for query "${query}":`, error);
      // Continue with other queries even if one fails
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Send completion message
  await writer.write(encoder.encode(`data: {"type":"message","message":"Web research completed"}\n\n`));
  
  // Close the stream
  await writer.close();
}

async function searchOpenRouter(query: string): Promise<SearchResult[]> {
  console.log(`Searching OpenRouter for: "${query}"`);
  
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://hunchex.com', // Replace with your app's domain
      'X-Title': 'Hunchex Web Research'
    },
    body: JSON.stringify({
      query,
      num_results: MAX_RESULTS_PER_QUERY
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter search API error:', errorText);
    throw new Error(`OpenRouter search failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('OpenRouter search results:', JSON.stringify(data).substring(0, 200) + '...');
  
  if (!data.results || !Array.isArray(data.results)) {
    console.error('Unexpected response format from OpenRouter:', data);
    return [];
  }
  
  // Map OpenRouter results to our SearchResult format
  return data.results.map((result: any) => ({
    url: result.url || '',
    title: result.title || '',
    content: result.content || result.snippet || ''
  })).filter((result: SearchResult) => result.url && result.content);
}
