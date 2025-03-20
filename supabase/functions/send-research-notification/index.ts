
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { jobId, email } = await req.json();
    
    if (!jobId || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: jobId and email' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log(`Processing notification request for job ${jobId} to email ${email}`);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Get job details
    const { data: job, error: jobError } = await supabaseClient
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
      
    if (jobError || !job) {
      console.error(`Error fetching job ${jobId}:`, jobError);
      return new Response(
        JSON.stringify({ error: `Job not found: ${jobError?.message || 'Unknown error'}` }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Check if notification has already been sent
    if (job.notification_sent) {
      console.log(`Notification for job ${jobId} already sent, skipping`);
      return new Response(
        JSON.stringify({ message: 'Notification already sent' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Get market details for better email content
    const { data: market, error: marketError } = await supabaseClient
      .from('markets')
      .select('question')
      .eq('id', job.market_id)
      .single();
      
    if (marketError) {
      console.error(`Error fetching market ${job.market_id}:`, marketError);
    }
    
    // Initialize Resend
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    
    // Prepare email content
    let emailSubject = '';
    let emailContent = '';
    
    if (job.status === 'completed') {
      emailSubject = `Research Complete: ${market?.question || 'Your market research'}`;
      
      // Parse results to extract key data if available
      let probabilityInfo = '';
      let resultsUrl = '';
      
      if (job.results) {
        try {
          const parsedResults = JSON.parse(job.results);
          if (parsedResults.structuredInsights?.probability) {
            probabilityInfo = `<p>Probability assessment: <strong>${parsedResults.structuredInsights.probability}</strong></p>`;
          }
        } catch (e) {
          console.error('Error parsing job results:', e);
        }
      }
      
      emailContent = `
        <h1>Your Research is Complete</h1>
        <p>The background research job for "${market?.question || 'your market'}" has completed.</p>
        ${probabilityInfo}
        <p>You can view the full results on the market page.</p>
        ${job.focus_text ? `<p>Research focus: ${job.focus_text}</p>` : ''}
        <p>Job ID: ${jobId}</p>
      `;
    } else if (job.status === 'failed') {
      emailSubject = `Research Failed: ${market?.question || 'Your market research'}`;
      emailContent = `
        <h1>Your Research Job Has Failed</h1>
        <p>Unfortunately, the background research job for "${market?.question || 'your market'}" has failed.</p>
        <p>Error: ${job.error_message || 'Unknown error'}</p>
        <p>Job ID: ${jobId}</p>
        <p>You can try running another research job on the market page.</p>
      `;
    } else {
      // Should not happen, but handle just in case
      emailSubject = `Research Job Update: ${market?.question || 'Your market research'}`;
      emailContent = `
        <h1>Research Job Update</h1>
        <p>Your background research job for "${market?.question || 'your market'}" is currently in status: ${job.status}.</p>
        <p>Job ID: ${jobId}</p>
      `;
    }
    
    // Send the email
    console.log(`Sending email to ${email} for job ${jobId}`);
    
    try {
      const emailResponse = await resend.emails.send({
        from: 'Research Notifications <onboarding@resend.dev>',
        to: [email],
        subject: emailSubject,
        html: emailContent
      });
      
      console.log(`Email sent successfully:`, emailResponse);
      
      // Update job to mark notification as sent
      const { error: updateError } = await supabaseClient
        .from('research_jobs')
        .update({ notification_sent: true })
        .eq('id', jobId);
        
      if (updateError) {
        console.error(`Error updating notification_sent for job ${jobId}:`, updateError);
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'Notification sent successfully' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (emailError) {
      console.error(`Error sending email for job ${jobId}:`, emailError);
      return new Response(
        JSON.stringify({ error: `Failed to send email: ${emailError.message}` }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
  } catch (error) {
    console.error('Error processing notification request:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
