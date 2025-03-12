
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, marketId, previousResults, iteration, areasForResearch, previousAnalyses, focusText } = await req.json();
    
    console.log(`Generating queries for: ${query} with iteration: ${iteration || 1}`);
    
    if (!query) {
      throw new Error("Query parameter is required");
    }

    // Different prompts based on first iteration vs. subsequent ones
    let systemPrompt, userPrompt;
    
    if (iteration > 1 && previousResults) {
      systemPrompt = "You are a sophisticated AI research assistant specializing in generating effective search queries to find information for prediction markets.";
      
      userPrompt = `I'm researching this prediction market question: "${query}". 
      
Previous research found:
${previousResults}

${previousAnalyses ? `Previous analyses:\n${previousAnalyses}\n\n` : ''}

${areasForResearch && areasForResearch.length > 0 ? 
  `Areas identified for further research:\n${areasForResearch.join('\n')}\n\n` : 
  ''}

${focusText ? `With specific focus on: "${focusText}"\n\n` : ''}

Based on this information, generate 5 NEW search queries that will help find additional information about aspects not yet covered or that need deeper investigation.

Make each query:
1. Self-contained with full context (a search engine should understand exactly what to search for)
2. Focused on uncovering new information, not repeating what we already know
3. Precise, specifying exact terms, entities, timeframes
4. Designed to fill gaps in our current understanding
5. Different from each other to cover various aspects

Output a JSON object with this format:
{ "queries": ["query1", "query2", "query3", "query4", "query5"] }`;

    } else {
      // First iteration - initial queries
      systemPrompt = "You are a sophisticated AI research assistant specializing in generating effective search queries to find information for prediction markets.";
      
      userPrompt = `Generate 5 search queries to thoroughly research this prediction market question: "${query}".

${focusText ? `With specific focus on: "${focusText}"\n\n` : ''}

Each query must be:
1. Self-contained with complete context (a search engine should understand exactly what to search for without any other context)
2. Precise, including specific terms, entities, and timeframes relevant to the question
3. Comprehensive enough to gather substantive information
4. Varied to cover different aspects (facts, analysis, history, expert opinions, statistics)
5. Focused on retrieving the most relevant and useful information for making a prediction

If the question involves time-sensitive predictions, include specific dates/timeframes in your queries.

Output a JSON object with this format:
{ "queries": ["query1", "query2", "query3", "query4", "query5"] }`;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`Error from OpenRouter API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    let queries;
    try {
      const parsedData = JSON.parse(content);
      queries = parsedData.queries;
      
      if (!Array.isArray(queries)) {
        throw new Error("Queries must be an array");
      }
      
      // Ensure there are at least 3 queries
      if (queries.length < 3) {
        console.warn("Less than 3 queries returned, adding generic ones");
        const genericQueries = [
          `${query} latest information and developments`,
          `${query} expert analysis and predictions`,
          `${query} historical precedents and similar cases`
        ];
        queries = [...queries, ...genericQueries.slice(0, 5 - queries.length)];
      }
      
      // Ensure there are at most 5 queries
      if (queries.length > 5) {
        queries = queries.slice(0, 5);
      }
      
      // Clean and improve the queries
      queries = queries.map(cleanQuery => {
        // Add market ID suffix
        let cleanQuery = cleanQuery.trim();
        
        // Ensure query has full context
        cleanQuery = addContextToQuery(cleanQuery, query, focusText);
      
        // Removing the length limit to ensure we get full queries
        return cleanQuery;
      });
      
      console.log("Generated queries:", queries);
    } catch (error) {
      console.error("Error parsing queries:", error, "Raw content:", content);
      // Fallback to generic queries
      queries = [
        `${query} latest developments and updates`,
        `${query} expert analysis and predictions`,
        `${query} historical precedents and similar cases`,
        `${query} statistical data and probability estimates`,
        `${query} critical factors affecting outcome`
      ];
      
      if (focusText) {
        queries = queries.map(q => `${q} regarding ${focusText}`);
      }
    }

    return new Response(JSON.stringify({ queries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error generating queries:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to ensure query has full context
function addContextToQuery(query: string, originalQuestion: string, focusText?: string): string {
  // Check if the query seems to be missing context
  const hasPronouns = /\b(this|that|these|those|it|they)\b/i.test(query);
  const hasVagueReferences = /\b(the question|the topic|the market|the prediction)\b/i.test(query);
  
  if (hasPronouns || hasVagueReferences) {
    // Add original question context
    if (focusText) {
      return `${query} regarding "${originalQuestion}" with focus on ${focusText}`;
    } else {
      return `${query} regarding "${originalQuestion}"`;
    }
  }
  
  // If the query doesn't mention the core question subject, add it
  const questionWords = originalQuestion.toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const mainTerms = questionWords.filter(w => w.length > 6).slice(0, 3); // Take the longest few words as main terms
  
  if (mainTerms.length > 0) {
    const queryLower = query.toLowerCase();
    const hasCoreTerms = mainTerms.some(term => queryLower.includes(term));
    
    if (!hasCoreTerms) {
      if (focusText) {
        return `${query} related to "${originalQuestion}" focusing on ${focusText}`;
      } else {
        return `${query} related to "${originalQuestion}"`;
      }
    }
  }
  
  return query;
}
