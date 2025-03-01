
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: new Headers(corsHeaders),
    });
  }

  try {
    const { query, previousResults, iteration, marketId, marketDescription } = await req.json();
    
    console.log(`Generating queries for market ${marketId}: ${marketDescription}`);

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Generate search queries based on the market description
    let queries: string[] = [];
    
    if (!previousResults) {
      // Initial queries should be focused on the market description
      // Extract key terms from the market description
      const keyTerms = extractKeyTerms(marketDescription || query);
      
      queries = [
        `${keyTerms[0]} latest news`,
        `${keyTerms[0]} prediction`,
        `${keyTerms[1]} analysis`
      ];
      
      // Add market ID specific query if it exists
      if (marketId) {
        queries.push(`market ${marketId} analysis`);
      }
    } else {
      // For subsequent iterations, refine based on previous results
      // Extract key terms from both the market description and previous results
      const keyTerms = extractKeyTerms(marketDescription || query);
      const previousTerms = extractKeyTerms(previousResults);
      
      // Combine terms for more targeted queries
      queries = [
        `${keyTerms[0]} ${previousTerms[0]} latest updates`,
        `${keyTerms[0]} ${previousTerms[1]} expert analysis`,
        `${previousTerms[0]} prediction`
      ];
    }
    
    // Ensure queries are not too long and are unique
    const processedQueries = [...new Set(
      queries.map(q => q.trim())
            .filter(q => q.length > 0)
            .map(q => q.length > 100 ? q.substring(0, 100) : q)
    )];
    
    return new Response(
      JSON.stringify({ queries: processedQueries }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating search queries:", error);
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

// Helper function to extract meaningful terms from text
function extractKeyTerms(text: string): string[] {
  if (!text) return ['market', 'prediction'];
  
  // Split the text into words and filter out common stop words
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'if', 'this', 'will', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'these', 'those', 'with', 'as', 'from']);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  // Get the most frequent meaningful words
  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }
  
  // Sort by frequency
  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);
  
  // Return the top terms, or defaults if none found
  return sortedWords.length > 0 
    ? sortedWords.slice(0, Math.min(5, sortedWords.length))
    : ['market', 'prediction'];
}
