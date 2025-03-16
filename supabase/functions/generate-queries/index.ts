import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  marketId: string;
  iteration?: number;
  previousQueries?: string[];
  focusText?: string;
  previousAnalyses?: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY is not set in environment" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const requestData: GenerateQueriesRequest = await req.json();
    const { query, marketId, iteration = 1, previousQueries = [], focusText, previousAnalyses = [] } = requestData;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Generating queries for: "${query}" (iteration ${iteration})`);
    if (focusText) {
      console.log(`With focus area: "${focusText}"`);
    }

    // Generate prompt based on iteration
    let prompt = `Generate 5 search queries that someone would type into a search engine to gather information about:
${query}

CRITICAL REQUIREMENTS:
1. Format as search queries, not sentences with questions or punctuation
2. Include specific entities, names, and key technical terms from the original topic
3. Each query should be informative and contextual, but not conversational
4. Avoid filler words like "what is" or "how to" unless absolutely necessary
5. Include enough context for relevant search results
6. Each query should target a specific aspect of the topic

Focus on different aspects that would be relevant for market research.`;

    // Add focus text if provided
    if (focusText && focusText.trim()) {
      prompt += `\n\nFOCUS AREA:
"${focusText.trim()}"

Ensure that most of your queries address this focus area while providing sufficient context.`;
    }

    // Adjust prompt based on iteration and include previous analyses
    if (iteration > 1) {
      prompt += `\n\nThis is iteration ${iteration}. Your goal is to identify SPECIFIC knowledge gaps from previous research and create targeted queries to fill those gaps.`;
      
      // Include previous analyses if available
      if (previousAnalyses.length > 0) {
        prompt += `\n\nBased on previous research, these were our findings:\n`;
        previousAnalyses.forEach((analysis, index) => {
          // Only use the first 300 characters of each analysis to keep prompt size manageable
          const truncatedAnalysis = analysis.length > 300 
            ? analysis.substring(0, 300) + "..." 
            : analysis;
          prompt += `\nAnalysis ${index + 1}: ${truncatedAnalysis}\n`;
        });
        
        prompt += `\nQUERY GENERATION INSTRUCTIONS:
1. Identify 5 SPECIFIC unanswered questions or knowledge gaps in the previous analyses
2. Create a targeted search query for EACH specific gap
3. Each query should be precise, focusing on one specific aspect or data point
4. Prioritize collecting factual information over opinions
5. Target recent or time-sensitive information where relevant`;
      } else {
        prompt += `\n\nKNOWLEDGE GAP REQUIREMENTS:
1. Analyze previous queries and target NEW topics not yet covered
2. Focus on missing information crucial for comprehensive understanding
3. Explore specialized sub-topics or alternative perspectives
4. Maintain search query format (not sentences)`;
      }
    }

    // Add previous queries to avoid repetition
    if (previousQueries.length > 0) {
      prompt += `\n\nAVOID generating queries similar to these:
${previousQueries.join('\n')}`;
    }

    prompt += `\n\nRespond with a JSON object containing a 'queries' array with exactly 5 search queries.`;

    // Call OpenRouter API
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: "You are a market research specialist that identifies specific knowledge gaps and generates effective search queries to fill those gaps. You create targeted queries that focus on obtaining precise information about specific aspects, data points, or examples needed."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${await openRouterResponse.text()}`);
    }

    const result = await openRouterResponse.json();
    const content = result.choices[0].message.content.trim();
    
    let queries = [];
    try {
      const queriesData = JSON.parse(content);
      queries = queriesData.queries || [];
      
      // Process queries to ensure they're in search engine format
      queries = queries.map((q: string) => {
        // Remove question marks and unnecessary punctuation
        let processedQuery = q.replace(/\?|\.|!|"/g, '');
        
        // Remove filler question starts if present
        processedQuery = processedQuery.replace(/^(what is|how to|why does|when did|where can|how do|is there|are there|can i|should i|would a)/i, '');
        
        // Ensure first letter is capitalized if query doesn't start with a proper noun
        if (processedQuery.length > 0 && processedQuery[0].toLowerCase() === processedQuery[0]) {
          const firstChar = processedQuery.charAt(0).toUpperCase();
          processedQuery = firstChar + processedQuery.slice(1);
        }
        
        return processedQuery.trim();
      });
    } catch (error) {
      console.error("Error parsing OpenRouter response:", error, content);
      
      // Generate fallback queries in search format style
      queries = [
        `${query} recent developments`,
        `${query} market forecast data`,
        `${query} historical trends statistics`,
        `${query} expert analysis`,
        `${query} performance metrics comparison`
      ];
      
      // If focus text exists, add it to a couple of queries
      if (focusText && focusText.trim()) {
        const focusKeywords = focusText.trim().split(' ').slice(0, 3).join(' ');
        queries[1] = `${query} ${focusKeywords} analysis`;
        queries[3] = `${focusKeywords} impact on ${query}`;
      }
    }

    console.log(`Generated ${queries.length} queries:`, queries);

    return new Response(
      JSON.stringify({ queries }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating queries:", error);
    
    return new Response(
      JSON.stringify({ 
        error: `Query generation error: ${error.message}`,
        queries: [
          `${query} key developments`,
          `${query} expert analysis`,
          `${query} historical data trends`,
          `${query} statistical metrics`,
          `${query} future projections`
        ]
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
