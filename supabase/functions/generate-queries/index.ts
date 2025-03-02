
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  previousResults?: string;
  iteration?: number;
  marketId?: string;
  marketDescription?: string;
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: GenerateQueriesRequest = await req.json();
    const { query, previousResults, iteration = 0, marketId, marketDescription } = requestData;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Generate queries request:", { 
      query, 
      iteration,
      marketDescription: marketDescription?.substring(0, 100)
    });

    let marketInfo = "";
    let searchContext = "";

    // Get market data if marketId is provided
    if (marketId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: marketData, error: marketError } = await supabase
        .from("markets")
        .select("question, description")
        .eq("id", marketId)
        .single();

      if (!marketError && marketData) {
        console.log("Found market data:", {
          question: marketData.question,
          description: marketData.description?.substring(0, 100)
        });
        
        marketInfo = `Market Question: ${marketData.question}
Market Description: ${marketData.description || ""}`;
        
        searchContext = marketData.question;
      } else {
        console.log("Using marketDescription as fallback:", marketDescription?.substring(0, 100));
        marketInfo = `Market Description: ${marketDescription || ""}`;
        
        searchContext = marketDescription || "";
      }
    } else if (marketDescription) {
      marketInfo = `Market Description: ${marketDescription}`;
      searchContext = marketDescription;
    }

    // Clean up the market question/description to focus on the actual query
    const cleanQuery = searchContext || query;
    let customQueries: string[] = [];

    // Use OpenRouter/Gemini to generate intelligent queries
    try {
      console.log("Calling OpenRouter for query generation");
      
      const marketSubject = cleanQuery.replace(/This market will resolve to "(Yes|No)" if /i, "")
        .replace(/\. Otherwise, this market will resolve to "(Yes|No)"\./i, "")
        .replace(/This market pertains to/i, "")
        .replace(/The resolution source will be.*/i, "")
        .replace(/This market will resolve.*/i, "");

      const promptContent = iteration === 0 
        ? `Generate 3 effective web search queries to find the most current and relevant information about the following topic: "${marketSubject}".
          Focus on finding factual information about this market prediction.
          Output should be in JSON format with an array of strings called "queries".
          Make queries specific, concise, and focused on finding recent and relevant information.
          Do not include "This market will resolve" or similar phrases in the queries.
          Each query should be 3-7 words long and directly related to the core subject.`
        : `Based on the previous research results: "${previousResults?.substring(0, 500)}...", 
          generate 3 new search queries to find additional information about: "${marketSubject}".
          Focus on finding facts we might have missed in our earlier research.
          Output should be in JSON format with an array of strings called "queries".
          Make queries specific, concise, and address potential information gaps.
          Do not include "This market will resolve" or similar phrases in the queries.
          Each query should be 3-7 words long and directly related to the core subject.`;

      const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": SUPABASE_URL,
          "X-Title": "HunchEx Web Research",
        },
        body: JSON.stringify({
          model: "google/gemini-flash",
          messages: [
            {
              role: "user",
              content: promptContent,
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });

      if (!openRouterResponse.ok) {
        throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${await openRouterResponse.text()}`);
      }

      const openRouterData: OpenRouterResponse = await openRouterResponse.json();
      console.log("OpenRouter response received");
      
      const content = openRouterData.choices?.[0]?.message?.content;
      
      if (content) {
        try {
          const parsedContent = JSON.parse(content);
          if (Array.isArray(parsedContent.queries) && parsedContent.queries.length > 0) {
            customQueries = parsedContent.queries;
            console.log("Generated custom queries from OpenRouter:", customQueries);
          }
        } catch (parseError) {
          console.error("Error parsing OpenRouter JSON response:", parseError);
          console.log("Raw content:", content);
        }
      }
    } catch (openRouterError) {
      console.error("OpenRouter API error:", openRouterError);
    }

    // Fallback to default queries if OpenRouter failed
    if (customQueries.length === 0) {
      console.log("Using fallback queries due to OpenRouter failure");
      
      if (iteration === 0) {
        // Initial queries - focused on core information
        customQueries = [
          `${cleanQuery} latest information`,
          `${cleanQuery} recent updates`,
          `${cleanQuery} analysis prediction`,
        ];
      } else if (previousResults) {
        // Refine queries based on previous results
        customQueries = [
          `${cleanQuery} latest information`,
          `${cleanQuery} analysis ${new Date().getFullYear()}`,
          `${cleanQuery} expert opinion`,
        ];
      }
    }

    // Trim and clean all queries
    const queries = customQueries.map(q => q.trim().replace(/\s+/g, ' '));
    
    // Filter out any empty queries
    const finalQueries = queries.filter(q => q.length > 0);
    
    console.log("Final queries:", finalQueries);

    return new Response(
      JSON.stringify({ queries: finalQueries }),
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
