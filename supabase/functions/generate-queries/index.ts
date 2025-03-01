
import { corsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

interface Response {
  queries: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { query, previousResults, iteration, marketId, marketDescription } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Simplified system message to save tokens
    const systemMessage = `You generate search queries for market research. Keep queries short, concise and focused. Each query should be maximum 100 characters.`;

    let userMessage = "";
    
    if (previousResults && iteration > 1) {
      userMessage = `Based on the market question: "${query.substring(0, 200)}" and these previous findings: "${previousResults.substring(0, 500)}", generate 3 short, focused search queries (max 100 characters each) to discover new information for iteration ${iteration}.`;
    } else {
      // For the first iteration, just extract key elements from the query
      userMessage = `For the market question: "${query.substring(0, 200)}", generate 3 short, focused search queries (max 100 characters each) to find relevant information. Keep each query under 100 characters.`;
    }

    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      console.error("OpenAI API error:", errorData);
      
      // Generate fallback queries if OpenAI fails
      const words = query.split(' ');
      const fallbackQueries = [
        words.slice(0, 6).join(' '),
        words.slice(0, 4).join(' ') + " latest news",
        words.slice(0, 4).join(' ') + " analysis"
      ];
      
      return new Response(
        JSON.stringify({ queries: fallbackQueries }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await apiResponse.json();
    
    const generatedText = data.choices[0].message.content;
    const queryRegex = /\d+\.\s*(.*?)(?=\d+\.|$)/gs;
    
    // Extract queries using regex
    const matches = [...generatedText.matchAll(queryRegex)];
    let queries = matches.map(match => match[1].trim());
    
    // If regex extraction failed, split by newlines
    if (queries.length === 0) {
      queries = generatedText
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^\d+\.?\s*/, '').trim())
        .filter(line => line.length > 0 && line.length <= 390);
    }
    
    // Limit to 3 queries and ensure none are too long
    queries = queries
      .slice(0, 3)
      .map(q => q.length > 390 ? q.substring(0, 390) : q);
    
    // Ensure we have at least one query
    if (queries.length === 0) {
      const words = query.split(' ');
      queries = [
        words.slice(0, 8).join(' '),
        words.slice(0, 6).join(' ') + " recent news",
        words.slice(0, 6).join(' ') + " analysis"
      ];
    }

    const response: Response = {
      queries,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
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
