
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { corsHeaders } from "../_shared/cors.ts";
import { initiateWebScrape } from "../_shared/webScrape.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, question, description, userId, email, focusText, outcomes, probabilities } = await req.json();
    
    if (!marketId) {
      return new Response(
        JSON.stringify({ error: "Missing marketId parameter" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check for existing pending job
    const { data: existingJobs, error: jobQueryError } = await supabaseClient
      .from("research_jobs")
      .select("*")
      .eq("market_id", marketId)
      .in("status", ["pending", "processing"])
      .limit(1);

    if (jobQueryError) {
      console.error("Error checking existing jobs:", jobQueryError);
      return new Response(
        JSON.stringify({ error: "Error checking existing jobs" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (existingJobs && existingJobs.length > 0) {
      return new Response(
        JSON.stringify({ 
          message: "A research job for this market is already in progress", 
          jobId: existingJobs[0].id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Create job record
    const { data: job, error: jobCreationError } = await supabaseClient
      .from("research_jobs")
      .insert({
        market_id: marketId,
        title: question || "Market Research",
        status: "pending",
        user_id: userId,
        notify_email: email,
        focus_text: focusText,
        search_params: {
          outcomes,
          probabilities
        },
        max_iterations: 3,
        current_iteration: 0,
        iterations: [],
        progress_log: []
      })
      .select()
      .single();

    if (jobCreationError) {
      console.error("Error creating job:", jobCreationError);
      return new Response(
        JSON.stringify({ error: "Error creating research job" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`Created research job ${job.id} for market ${marketId}`);

    // Generate search queries
    const generateQueriesUrl = "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-queries";
    
    const inputText = focusText 
      ? `${question} ${description || ''} Focus on: ${focusText}`
      : `${question} ${description || ''}`;

    const queriesResponse = await fetch(generateQueriesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        ...corsHeaders
      },
      body: JSON.stringify({ text: inputText.trim() })
    });

    if (!queriesResponse.ok) {
      const errorText = await queriesResponse.text();
      console.error(`Query generation failed: ${queriesResponse.status} ${errorText}`);
      
      await supabaseClient
        .from("research_jobs")
        .update({ 
          status: "failed",
          error_message: `Failed to generate search queries: ${errorText}`,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
        
      return new Response(
        JSON.stringify({ error: "Failed to generate search queries", jobId: job.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const queriesData = await queriesResponse.json();
    const queries = queriesData.queries || [];

    console.log(`Generated ${queries.length} search queries for job ${job.id}`);

    // Update job with queries
    await supabaseClient
      .from("research_jobs")
      .update({ 
        search_queries: queries,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);

    // Start the web scraping process
    try {
      await initiateWebScrape(queries, marketId, focusText);
      
      // Update job status to processing
      await supabaseClient
        .from("research_jobs")
        .update({ 
          status: "processing",
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      
    } catch (scrapeError) {
      console.error(`Web scrape failed for job ${job.id}:`, scrapeError);
      
      await supabaseClient
        .from("research_jobs")
        .update({ 
          status: "failed",
          error_message: `Failed to start web research: ${scrapeError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
        
      return new Response(
        JSON.stringify({ error: "Failed to start web research", jobId: job.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Send notification email if email is provided
    if (email) {
      try {
        const notificationUrl = "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/send-research-notification";
        await fetch(notificationUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            ...corsHeaders
          },
          body: JSON.stringify({ jobId: job.id, email })
        });
        console.log(`Notification email sent for job ${job.id} to ${email}`);
      } catch (emailError) {
        console.error(`Failed to send notification email for job ${job.id}:`, emailError);
        // Don't fail the job just because email sending failed
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Research job created and processing started",
        jobId: job.id
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201 }
    );
    
  } catch (error) {
    console.error("Error in create-research-job function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
