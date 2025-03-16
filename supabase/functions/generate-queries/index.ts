
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  marketId: string;
  iteration?: number;
  previousQueries?: string[];
  focusText?: string;
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
    const { query, marketId, iteration = 1, previousQueries = [], focusText } = requestData;

    console.log("Received generate-queries request:", JSON.stringify(requestData, null, 2));

    if (!query) {
      console.error("Missing required query parameter");
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!marketId) {
      console.error("Missing required marketId parameter");
      return new Response(
        JSON.stringify({ error: "marketId parameter is required" }),
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

    // Add focus text if provided
    if (focusText && focusText.trim()) {
      prompt += `\n\nThe user has provided the following FOCUS AREA that should guide your queries:
"${focusText.trim()}"

Ensure that most of your queries specifically address this focus area while still maintaining full context.`;
    }

    // Adjust prompt based on iteration
    if (iteration > 1) {
      prompt += `\n\nThis is iteration ${iteration}. Based on previous searches, dig deeper and focus on more specific aspects or angles that haven't been covered yet.`;
    }

    // Add previous queries to avoid repetition
    if (previousQueries.length > 0) {
      prompt += `\n\nAVOID generating queries similar to these previously used queries:
${previousQueries.join('\n')}`;
    }

    prompt += `\n\nRespond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;

    console.log("Sending prompt to OpenRouter API");

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
      const errorText = await openRouterResponse.text();
      console.error(`OpenRouter API error: ${openRouterResponse.status}`, errorText);
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${errorText}`);
    }

    const result = await openRouterResponse.json();
    console.log("Received response from OpenRouter");
    
    const content = result.choices[0].message.content.trim();
    
    let queries = [];
    let reasoning = "";
    
    try {
      const queriesData = JSON.parse(content);
      queries = queriesData.queries || [];
      reasoning = queriesData.reasoning || "Generated based on the topic and search guidelines";
      
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
      
      console.log(`Successfully parsed ${queries.length} queries from AI response`);
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
      
      // If focus text exists, add it to a couple of queries
      if (focusText && focusText.trim()) {
        queries[1] = `${query} ${focusText.trim()} analysis and implications`;
        queries[3] = `${focusText.trim()} impact on ${query}`;
      }
      
      reasoning = "Generated fallback queries due to parsing error";
    }

    console.log(`Generated ${queries.length} queries:`, queries);

    return new Response(
      JSON.stringify({ 
        queries,
        reasoning,
        focus: focusText || null
      }),
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
