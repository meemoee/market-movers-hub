
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0"
import { Resend } from "https://esm.sh/resend@2.0.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ResearchNotificationPayload {
  jobId: string;
  email: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log("Research notification function called");
    
    // Validate the Resend API key first
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      throw new Error('RESEND_API_KEY is not configured');
    }
    
    const resend = new Resend(resendApiKey);
    
    // Set up Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials are not configured');
      throw new Error('Supabase credentials are not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse and validate payload
    const payload = await req.json();
    console.log("Received payload:", JSON.stringify(payload));
    
    const { jobId, email }: ResearchNotificationPayload = payload;
    
    if (!jobId || !email) {
      console.error('Missing required fields:', { jobId, email });
      return new Response(
        JSON.stringify({ error: 'Job ID and email are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email);
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log(`Preparing to send notification for job ${jobId} to ${email}`);
    
    // Get job data
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
      
    if (jobError || !job) {
      console.error('Error fetching job:', jobError);
      return new Response(
        JSON.stringify({ error: 'Research job not found', details: jobError }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log(`Found job data:`, JSON.stringify(job));
    
    // Check if notification has already been sent
    if (job.notification_sent) {
      console.log(`Notification already sent for job ${jobId}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Notification was already sent',
          alreadySent: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Get market data for more context
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('question')
      .eq('id', job.market_id)
      .single();
      
    if (marketError) {
      console.error('Error fetching market:', marketError);
    }
    
    const marketQuestion = market?.question || 'research question';
    const focusText = job.focus_text || 'General research';
    
    // Get probability if available
    let probability = "Not available";
    if (job.results) {
      try {
        const results = JSON.parse(job.results);
        if (results.structuredInsights && results.structuredInsights.probability) {
          probability = results.structuredInsights.probability;
        }
      } catch (e) {
        console.error('Error parsing job results:', e);
      }
    }
    
    console.log(`Preparing email with focus: ${focusText}, probability: ${probability}`);
    
    // Send email with retry logic
    let emailResult;
    let emailError;
    const MAX_RETRIES = 2;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt} for sending email notification`);
        }
        
        const response = await resend.emails.send({
          from: 'HunchEx Research <onboarding@resend.dev>',
          to: [email],
          subject: `Research Complete: ${focusText.slice(0, 50)}${focusText.length > 50 ? '...' : ''}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #5928e5; font-size: 24px; margin-top: 30px;">Your Research Is Complete</h1>
              <p>Your background research job has finished processing.</p>
              
              <div style="background-color: #f4f4f8; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <h2 style="font-size: 18px; margin-top: 0;">Research Details</h2>
                <p><strong>Market:</strong> ${marketQuestion}</p>
                <p><strong>Focus:</strong> ${focusText}</p>
                <p><strong>Probability Assessment:</strong> ${probability}</p>
              </div>
              
              <p>Log in to HunchEx to view your complete research results and analysis.</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
                <p>This is an automated message from HunchEx Research.</p>
              </div>
            </div>
          `,
        });
        
        emailResult = response;
        emailError = null;
        break; // Success, exit retry loop
      } catch (error) {
        console.error(`Error sending email (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, error);
        emailError = error;
        
        if (attempt < MAX_RETRIES) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    
    if (emailError) {
      console.error('All email send attempts failed:', emailError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send email notification after multiple attempts', 
          details: emailError 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log(`Email sent successfully to ${email}`);
    
    // Update job to mark notification as sent
    const { error: updateError } = await supabase
      .from('research_jobs')
      .update({ notification_sent: true })
      .eq('id', jobId);
      
    if (updateError) {
      console.error('Error updating job notification status:', updateError);
      return new Response(
        JSON.stringify({ 
          warning: 'Email sent but failed to update notification status',
          emailResult: emailResult,
          updateError: updateError
        }),
        { 
          status: 207, // Partial success
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log(`Successfully sent email notification to ${email} for job ${jobId}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email notification sent successfully',
        data: emailResult
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Error in send-research-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
