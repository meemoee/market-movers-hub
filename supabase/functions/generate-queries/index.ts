
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  title?: string;
  previousResults?: string;
  iteration?: number;
  marketId?: string;
  marketDescription?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: GenerateQueriesRequest = await req.json();
    const { query, title, previousResults, iteration = 0, marketDescription } = requestData;

    if (!query && !marketDescription) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Generate queries request:", { 
      query: query?.substring(0, 100), 
      title,
      iteration,
      marketDescription: marketDescription?.substring(0, 100)
    });

    // Prioritize using the question or description
    const searchContext = query || marketDescription || "";
    let searchTitle = title || "";
    
    // Clean up and extract key components from the market description
    const cleanQuery = searchContext.trim();
    const questionMatch = cleanQuery.match(/^(.*?)\?/);
    const keywords = cleanQuery.split(/\s+/).filter(word => word.length > 3);
    
    // Create search phrases from the title and description
    let keyPhrase = "";
    if (searchTitle) {
      keyPhrase = searchTitle;
    } else if (questionMatch && questionMatch[0]) {
      keyPhrase = questionMatch[0];
    } else if (keywords.length >= 3) {
      keyPhrase = keywords.slice(0, 5).join(' ');
    } else {
      keyPhrase = cleanQuery.split('.')[0];
    }
    
    // Limit key phrase to a reasonable length
    if (keyPhrase.length > 100) {
      keyPhrase = keyPhrase.substring(0, 100);
    }
    
    // Generating search queries based on the market information and iteration
    let queries: string[] = [];
    
    if (iteration === 0) {
      // Initial focused queries based on key phrase and title
      if (searchTitle) {
        queries = [
          `${searchTitle} ${keyPhrase.substring(0, 50)} latest information`,
          `${keyPhrase.substring(0, 70)} recent updates`,
          `${searchTitle} analysis prediction`
        ];
      } else {
        queries = [
          `${keyPhrase} latest information`,
          `${keyPhrase} recent updates`,
          `${keyPhrase} analysis prediction`
        ];
      }
    } else if (previousResults) {
      // Extract important terms from previous results
      const terms = previousResults
        .split(/\s+/)
        .filter(word => word.length > 5)
        .filter(word => !['information', 'analysis', 'however', 'therefore'].includes(word.toLowerCase()))
        .slice(0, 10);
      
      const uniqueTerms = [...new Set(terms)];
      const relevantTerms = uniqueTerms.slice(0, 3).join(' ');
      
      // Generate more specific queries based on previous results
      queries = [
        `${keyPhrase} ${relevantTerms} recent developments`,
        `${keyPhrase} expert analysis ${new Date().getFullYear()}`,
        searchTitle ? `${searchTitle} ${relevantTerms} latest news` : `${keyPhrase} latest news`
      ];
    }

    // Trim and clean all queries
    queries = queries.map(q => q.trim().replace(/\s+/g, ' '));
    
    // Filter out any empty queries
    queries = queries.filter(q => q.length > 0);
    
    console.log("Generated queries:", queries);

    return new Response(
      JSON.stringify({ queries }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generate queries error:", error);
    
    return new Response(
      JSON.stringify({ error: `Generate queries error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
