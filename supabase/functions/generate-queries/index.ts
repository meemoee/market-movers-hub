
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, marketId, marketDescription, previousResults, iteration = 0 } = await req.json();
    
    // Log the request details
    console.log("Generate queries request:");
    console.log(`- Market ID: ${marketId}`);
    console.log(`- Market Description: ${marketDescription?.substring(0, 100)}${marketDescription?.length > 100 ? '...' : ''}`);
    console.log(`- Iteration: ${iteration}`);

    // If we have a marketId, try to fetch more information from the database
    let marketInfo = null;
    if (marketId) {
      const { data, error } = await supabase
        .from("markets")
        .select("id, question, description, subtitle, yes_sub_title, no_sub_title")
        .eq("id", marketId)
        .single();
      
      if (error) {
        console.error("Error fetching market info:", error);
      } else if (data) {
        marketInfo = data;
        console.log("Retrieved market info:", JSON.stringify(marketInfo, null, 2));
      }
    }

    // Combine all market information we have
    const fullMarketDescription = marketInfo?.question || marketDescription || query || "";
    const additionalContext = marketInfo?.description || "";
    
    console.log("Full market description to use for query generation:", fullMarketDescription);

    let prompt = "";
    
    if (iteration === 0) {
      // Initial queries generation
      prompt = `
You are a market research assistant. Generate 3 clear, focused search queries to gather information about the following prediction market:

Market: ${fullMarketDescription}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Generate 3 search queries that are:
1. Short (under 8 words each)
2. Focused on finding factual information
3. Will help analyze the probability of this market resolving to YES

Return only the queries, one per line, with no numbers or other text.
`;
    } else {
      // Refined queries based on previous results
      prompt = `
You are a market research assistant. Based on the previous research results, generate 3 refined search queries to gather additional information about this prediction market:

Market: ${fullMarketDescription}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Previous analysis: ${previousResults ? previousResults.substring(0, 500) : "No previous results"}

Generate 3 search queries that:
1. Are short (under 8 words each)
2. Fill gaps in the existing research
3. Target specific aspects not covered yet
4. Will help analyze the probability of this market resolving to YES

Return only the queries, one per line, with no numbers or other text.
`;
    }

    // For simplicity, let's manually generate some queries based on the market description
    // In a real implementation, you would use an AI to generate these queries
    
    let queries = [];
    
    // Generate simple queries based on the market description
    const marketWords = fullMarketDescription.split(' ').filter(w => w.length > 3);
    
    if (iteration === 0) {
      // For first iteration, use simple keyword extraction
      const keyTerms = extractKeyTerms(fullMarketDescription);
      
      queries = [
        `${keyTerms.slice(0, 3).join(' ')} latest news`,
        `${keyTerms.slice(0, 2).join(' ')} prediction`,
        `${keyTerms.slice(0, 2).join(' ')} analysis`
      ];
      
      if (marketId) {
        // Always add a market ID specific query as backup
        queries.push(`${marketId} analysis`);
      }
    } else {
      // For subsequent iterations, try to target gaps
      const keyTerms = extractKeyTerms(fullMarketDescription);
      const secondaryTerms = extractKeyTerms(additionalContext || "");
      
      queries = [
        `${keyTerms.slice(0, 2).join(' ')} ${secondaryTerms.slice(0, 1).join(' ')} research`,
        `${keyTerms.slice(0, 2).join(' ')} expert opinion`,
        `${keyTerms.slice(0, 1).join(' ')} ${secondaryTerms.slice(0, 1).join(' ')} probability`
      ];
    }
    
    // Ensure queries are unique
    queries = [...new Set(queries)];
    
    // Limit to 3 queries
    queries = queries.slice(0, 3);
    
    console.log("Generated queries:", queries);

    return new Response(
      JSON.stringify({
        queries: queries,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );

  } catch (error) {
    console.error("Error generating queries:", error);
    return new Response(
      JSON.stringify({ error: `Failed to generate queries: ${error.message}` }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});

// Helper function to extract key terms from text
function extractKeyTerms(text: string): string[] {
  if (!text) return [];
  
  // Remove common stop words
  const stopWords = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to", "from",
    "by", "with", "in", "out", "will", "be", "is", "are", "was", "were", "this", "that", 
    "these", "those", "market", "resolve", "yes", "no", "if", "it", "its"
  ]);
  
  // Split text into words, filter out short words and stop words
  const words = text
    .replace(/[^\w\s]/gi, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word.toLowerCase()))
    .map(word => word.toLowerCase());
  
  // Count word frequencies
  const wordCounts = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Sort by frequency
  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
  
  return sortedWords.slice(0, 10); // Return top 10 terms
}
