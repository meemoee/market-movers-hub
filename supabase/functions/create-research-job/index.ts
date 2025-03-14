import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Update the request interface to include focusText
interface ResearchJobRequest {
  marketId: string;
  query: string;
  focusText?: string;
  maxIterations?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    // Get the request body
    const { marketId, query, focusText = "", maxIterations = 3 }: ResearchJobRequest = await req.json();

    // Validate required parameters
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: "Market ID and query are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create the research job
    const { data: job, error } = await supabaseClient
      .from("research_jobs")
      .insert({
        market_id: marketId,
        query: query,
        focus_text: focusText,
        max_iterations: maxIterations,
        status: "pending",
        iterations: [],
        progress_log: [],
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating research job:", error);
      return new Response(
        JSON.stringify({ error: `Failed to create research job: ${error.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Created research job with ID: ${job.id}`);

    // Return the created job
    return new Response(
      JSON.stringify({ job }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
