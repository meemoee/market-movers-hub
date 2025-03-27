
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { JobHandler } from "./jobHandler.ts";

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, marketId, user_id, focus_text, email, marketData } = await req.json();
    
    if (!query || !marketId) {
      throw new Error('Missing required parameters: query and marketId');
    }

    console.log(`Creating research job for market ${marketId}: "${query.substring(0, 50)}..."`);
    if (focus_text) {
      console.log(`Research focus: ${focus_text}`);
    }
    
    // Initialize the job handler
    const jobHandler = new JobHandler(supabase);
    
    // Create the job and start the background process
    const jobId = await jobHandler.createJob({
      query,
      marketId, 
      userId: user_id,
      focusText: focus_text,
      notificationEmail: email,
      marketData
    });

    console.log(`Created job ${jobId} and started background process`);

    return new Response(
      JSON.stringify({ 
        jobId,
        message: 'Research job created and started processing in the background' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in create-research-job:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred while creating the research job' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
