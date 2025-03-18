
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { OpenRouter } from "./openRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) {
      throw new Error("OPENROUTER_API_KEY environment variable not set");
    }
    
    const openRouter = new OpenRouter(openRouterKey);
    
    const response = await openRouter.complete(
      "google/gemini-flash-1.5",
      [
        {
          role: "system", 
          content: "You are a helpful research assistant."
        },
        {
          role: "user", 
          content: `Research the following: ${query}`
        }
      ],
      1000,
      0.7
    );
    
    return new Response(
      JSON.stringify({ result: response }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in deep-research function:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
