
import { serve } from "http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get request body
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid or missing query parameter');
    }

    console.log(`Generating search queries for: "${query}"`);

    // Generate a set of search queries based on the original query
    // Here we'll use simple strategies to create different search variations
    const baseQuery = query.trim();
    
    // Create different query variations
    const queries = [
      baseQuery, // Original query
    ];

    // Add keyword variations
    const words = baseQuery.split(/\s+/).filter(w => w.length > 3);
    
    // Extract key phrases (simple approach - chunks of 2-3 consecutive words)
    if (words.length >= 3) {
      // Take first 3 words
      queries.push(words.slice(0, 3).join(' '));
      
      // Take last 3 words
      queries.push(words.slice(-3).join(' '));
      
      // Take middle 3 words if there are enough
      if (words.length >= 5) {
        const middleIndex = Math.floor(words.length / 2);
        queries.push(words.slice(middleIndex - 1, middleIndex + 2).join(' '));
      }
    } else if (words.length === 2) {
      queries.push(words.join(' '));
    }

    // Add more specific variations by combining important terms
    if (words.length >= 4) {
      // Take first and last words
      queries.push(`${words[0]} ${words[words.length - 1]}`);
      
      // Take two middle words
      const middleIndex = Math.floor(words.length / 2);
      queries.push(`${words[middleIndex - 1]} ${words[middleIndex]}`);
    }

    // Filter out duplicate queries and ensure we have at least one
    const uniqueQueries = [...new Set(queries)].filter(q => q.length > 0);
    
    if (uniqueQueries.length === 0) {
      uniqueQueries.push(baseQuery); // Fallback to original query
    }

    console.log(`Generated ${uniqueQueries.length} search queries:`, uniqueQueries);

    return new Response(JSON.stringify({ 
      queries: uniqueQueries 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating queries:', error.message);
    
    return new Response(JSON.stringify({ 
      error: `Query generation error: ${error.message}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
