
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  marketId: string;
  iteration?: number;
  previousQueries?: string[];
  previousAnalyses?: string[]; // Add support for previous analyses
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
    const { query, marketId, iteration = 1, previousQueries = [], previousAnalyses = [] } = requestData;

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
    console.log(`Previous analyses count: ${previousAnalyses.length}`);

    // Generate prompt based on iteration
    let prompt = `Generate 5 diverse search queries to gather comprehensive information about the following topic:
${query}

CRITICAL GUIDELINES FOR QUERIES:
1. Each query MUST be self-contained and provide full context - a search engine should understand exactly what you're asking without any external context
2. Include specific entities, dates, events, or proper nouns from the original question
3. AVOID vague terms like "this event", "the topic", or pronouns without clear referents
4. Make each query a complete, standalone question or statement that contains ALL relevant context
5. If the original question asks about a future event, include timeframes or dates
6. Use precise terminology and specific entities mentioned in the original question

Focus on different aspects that would be relevant for market research.`;

    // Adjust prompt based on iteration and previous analyses
    if (iteration > 1 && previousAnalyses.length > 0) {
      // Get the most recent analysis to inform the next queries
      const latestAnalysis = previousAnalyses[previousAnalyses.length - 1];
      
      prompt += `\n\nThis is iteration ${iteration}. Based on previous searches and analysis, dig deeper and focus on more specific aspects or angles that haven't been covered yet.

Previous analysis has identified these insights:
${latestAnalysis}

Generate search queries that specifically address gaps in our knowledge or explore areas mentioned in the analysis that need more investigation.`;
    } else if (iteration > 1) {
      prompt += `\n\nThis is iteration ${iteration}. Based on previous searches, dig deeper and focus on more specific aspects or angles that haven't been covered yet.`;
    }

    // Add previous queries to avoid repetition
    if (previousQueries.length > 0) {
      prompt += `\n\nAVOID generating queries similar to these previously used queries:
${previousQueries.join('\n')}`;
    }

    prompt += `\n\nRespond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;

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
            content: "You are a helpful assistant that generates search queries."
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
      
      // Process queries to ensure each has full context
      queries = queries.map((q: string) => {
        // Check for common issues in queries
        if (q.includes("this") || q.includes("that") || q.includes("the event") || q.includes("the topic")) {
          // Add original query context
          return `${q} regarding ${query}`;
        }
        
        // Check if query likely has enough context
        const hasNames = /[A-Z][a-z]+/.test(q); // Has proper nouns
        const isLongEnough = q.length > 40;     // Is reasonably detailed
        
        if (!hasNames || !isLongEnough) {
          // Add more context
          return `${q} about ${query}`;
        }
        
        return q;
      });
    } catch (error) {
      console.error("Error parsing OpenRouter response:", error, content);
      
      // Generate fallback queries with full context if parsing fails
      queries = [
        `${query} latest developments and facts`,
        `${query} comprehensive analysis and expert opinions`,
        `${query} historical precedents and similar cases`,
        `${query} statistical data and probability estimates`,
        `${query} future outlook and critical factors`
      ];
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
          "Latest developments and news",
          "Expert analysis and opinions",
          "Historical precedents and similar cases",
          "Statistical data and probability estimates",
          "Future outlook and critical factors"
        ]
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
