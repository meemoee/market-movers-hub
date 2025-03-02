
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
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
      marketId,
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
          id: marketId,
          question: marketData.question,
          description: marketData.description?.substring(0, 100)
        });
        
        marketInfo = `Market ID: ${marketId}
Market Question: ${marketData.question}
Market Description: ${marketData.description || ""}`;
        
        searchContext = marketData.question;
      } else {
        console.log("Using marketDescription as fallback:", marketDescription?.substring(0, 100));
        marketInfo = `Market ID: ${marketId}
Market Description: ${marketDescription || ""}`;
        
        searchContext = marketDescription || "";
      }
    } else if (marketDescription) {
      marketInfo = `Market Description: ${marketDescription}`;
      searchContext = marketDescription;
    }

    // Filter out excess spaces and ensure a clean query
    const cleanQuery = searchContext || query;
    
    // Generating search queries based on the market information and iteration
    let queries: string[] = [];
    
    if (iteration === 0) {
      // Initial queries - focused on core information
      queries = [
        `${cleanQuery} latest news`,
        `${cleanQuery} prediction`,
        `${marketId || ""} ${cleanQuery} analysis`,
      ];
    } else if (previousResults) {
      // Refine queries based on previous results
      // Use simple queries for now to ensure we get results
      queries = [
        `${cleanQuery} latest information`,
        `${cleanQuery} analysis ${new Date().getFullYear()}`,
        `${cleanQuery} expert opinion`,
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
