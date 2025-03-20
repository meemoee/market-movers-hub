
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, email, marketId, query } = await req.json();
    
    if (!jobId || !email) {
      return new Response(
        JSON.stringify({ error: 'jobId and email are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Sending research notification for job ${jobId} to ${email}`);
    
    // Get the job data
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      throw new Error('Failed to fetch job data');
    }
    
    // Get market data
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('question, url')
      .eq('id', marketId)
      .single();
    
    const marketQuestion = market?.question || query;
    const marketUrl = market?.url || `${supabaseUrl}/markets/${marketId}`;
    
    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Research Assistant <research@metaprediction.com>',
        to: email,
        subject: `Your Research is Complete: ${marketQuestion.substring(0, 50)}${marketQuestion.length > 50 ? '...' : ''}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Your Research is Complete</h2>
            <p>Your requested research on the following question has been completed:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>${marketQuestion}</strong>
            </div>
            
            <p>To view your research results, please visit the market page:</p>
            <p style="text-align: center;">
              <a href="${marketUrl}" style="display: inline-block; background-color: #4a4a4a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                View Research Results
              </a>
            </p>
            
            <p style="color: #666; font-size: 0.9em; margin-top: 30px;">
              Job ID: ${jobId}<br>
              Completed on: ${new Date().toLocaleString()}
            </p>
          </div>
        `
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to send email: ${errorData.message || response.statusText}`);
    }
    
    // Update the job to mark notification as sent
    await supabase
      .from('research_jobs')
      .update({ notification_sent: true })
      .eq('id', jobId);
    
    return new Response(
      JSON.stringify({ success: true, message: "Notification email sent" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
