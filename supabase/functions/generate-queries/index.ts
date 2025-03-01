
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  query: string;
  previousResults?: string;
  iteration?: number;
  marketId?: string;
  marketDescription?: string;
}

// OpenRouter API configuration
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const MODEL = "anthropic/claude-3-haiku-20240307";

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, previousResults, iteration = 0, marketId, marketDescription } = await req.json() as RequestBody;

    console.log(`Generate Queries request: market ID ${marketId}, iteration ${iteration}`);
    console.log(`Market description: ${marketDescription?.substring(0, 100)}${marketDescription?.length > 100 ? '...' : ''}`);
    
    // Prepare a more relevant context for query generation
    let prompt = "";
    
    // If we have both marketId and marketDescription, use them to create more focused queries
    if (marketId && marketDescription) {
      prompt = `Generate ${iteration > 0 ? 'refined' : 'initial'} search queries to research the following market prediction: "${marketDescription}".
      
Market ID: ${marketId}

${previousResults ? `Based on previous research findings: "${previousResults}"\n\n` : ''}

${iteration > 0 
  ? `This is iteration ${iteration}. Focus on areas that need more investigation or clarification from the previous results.` 
  : 'These queries will be used to search for relevant information about this market prediction.'}

Generate ${iteration > 0 ? '3-4' : '4-5'} concise, focused search queries that will yield the most relevant information to evaluate this prediction. Each query should be under 100 characters if possible and target specific aspects of the market. Make queries specific and avoid generic terms.`;
    } 
    // Fall back to the original query if market context isn't available
    else {
      prompt = `Generate ${iteration > 0 ? 'refined' : 'initial'} search queries for the following topic/question: "${query}"
      
${previousResults ? `Based on previous research findings: "${previousResults}"\n\n` : ''}

${iteration > 0 
  ? `This is iteration ${iteration}. Focus on areas that need more investigation or clarification from the previous results.` 
  : 'These queries will be used for web search to gather information.'}

Generate ${iteration > 0 ? '3-4' : '4-5'} concise, focused search queries that will yield the most relevant information. Each query should be under 100 characters if possible.`;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://hunchex.com",
        "X-Title": "Hunchex Research",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are a query generation assistant that creates effective web search queries based on topics and previous search results. Your queries should be concise, focused, and diverse to cover different aspects of the topic."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API error: ${response.status} ${errorText}`);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || "";
    
    // Extract the queries from the generated text
    const queryRegex = /^\d+\.\s+(.*?)$/gm;
    const queryMatches = [...generatedText.matchAll(queryRegex)];
    
    const queries = queryMatches.map(match => match[1].trim());
    
    // If no queries were extracted, try to extract lines that might be queries
    const fallbackQueries = queries.length > 0 
      ? queries 
      : generatedText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('```') && line.length < 300);
    
    // Ensure we get at least some queries by adding defaults if needed
    const finalQueries = fallbackQueries.length > 0 
      ? fallbackQueries 
      : marketDescription 
        ? [
            `${marketDescription.split(' ').slice(0, 6).join(' ')} latest information`,
            `${marketDescription.split(' ').slice(0, 6).join(' ')} analysis`,
            `${marketId} market prediction analysis`
          ]
        : [
            `${query} latest information`,
            `${query} analysis`,
            `${query} details`
          ];
    
    console.log("Generated queries:", finalQueries);

    return new Response(JSON.stringify({ queries: finalQueries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error generating queries:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
