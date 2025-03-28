import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Perform web research by scraping content based on a search query and analyzing it
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, marketId, marketQuestion, focusText, jobId } = await req.json();
    
    if (!query) {
      throw new Error("Query parameter is required");
    }

    // Log the request
    console.log(`Web research request: query=${query}, marketId=${marketId}, focusText=${focusText}`);

    // Call the web-scrape edge function to get content
    const scrapeResponse = await fetch(`https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/web-scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
      },
      body: JSON.stringify({ 
        queries: [query],
        marketId,
        focusText
      })
    });

    if (!scrapeResponse.ok) {
      throw new Error(`Web scrape failed: ${await scrapeResponse.text()}`);
    }

    const scrapeData = await scrapeResponse.json();
    
    console.log(`Web scrape response:`, scrapeData);

    // Call analyze-web-content to process the scraped content
    const analysisResponse = await fetch(`https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/analyze-web-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
      },
      body: JSON.stringify({
        webContent: scrapeData.content,
        marketId,
        query,
        marketQuestion,
        focusText
      })
    });

    if (!analysisResponse.ok) {
      throw new Error(`Content analysis failed: ${await analysisResponse.text()}`);
    }

    const analysisData = await analysisResponse.json();
    
    console.log(`Analysis response:`, {
      analysisLength: analysisData.analysis?.length,
      probabilityProvided: !!analysisData.probability
    });

    // Add insight extraction as a "fire-and-forget" call if jobId is provided
    if (jobId) {
      console.log(`Initiating insights extraction as background task for job ${jobId}`);
      
      try {
        // Construct request body for extract-research-insights
        const insightsRequestBody = {
          webContent: scrapeData.content,
          analysis: analysisData.analysis,
          marketId,
          marketQuestion,
          queries: [query],
          focusText,
          jobId // Pass the jobId so it can update the job directly
        };

        // Make the request without awaiting it
        fetch(`https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/extract-research-insights`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
          },
          body: JSON.stringify(insightsRequestBody)
        }).catch(error => {
          console.error(`Background insights request error for job ${jobId}:`, error);
        });
        
        console.log(`Insights extraction initiated as background task for job ${jobId}`);
      } catch (insightsError) {
        console.error(`Failed to initiate insights extraction for job ${jobId}:`, insightsError);
        // Don't fail the whole function just because insights extraction couldn't be started
      }
    }

    // Return the analysis result
    return new Response(
      JSON.stringify({
        ...analysisData,
        // Don't wait for insights, they'll be processed in the background
        message: "Web research completed successfully. Insights extraction started in background."
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error(`Error in web-research function:`, error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "An unknown error occurred during web research" 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
