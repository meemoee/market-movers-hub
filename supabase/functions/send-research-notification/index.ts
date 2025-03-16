
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0"
import { Resend } from "npm:resend@2.0.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"))

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { jobId, email } = await req.json()

    if (!jobId || !email) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required parameters: jobId and email are required" 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing notification for job ${jobId} to ${email}`)

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get job data
    const { data: jobData, error: jobError } = await supabaseClient
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !jobData) {
      console.error(`Error fetching job data: ${jobError?.message}`)
      return new Response(
        JSON.stringify({ error: `Job not found: ${jobError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (jobData.status !== 'completed' && jobData.status !== 'failed') {
      console.error(`Cannot send notification for job in status: ${jobData.status}`)
      return new Response(
        JSON.stringify({ error: `Job is not completed or failed yet: ${jobData.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get market data
    const { data: marketData, error: marketError } = await supabaseClient
      .from('markets')
      .select('question')
      .eq('id', jobData.market_id)
      .single()

    if (marketError) {
      console.error(`Error fetching market data: ${marketError.message}`)
    }

    // Prepare email content
    let emailContent = ""
    let emailSubject = ""
    let probability = "Not available"

    if (jobData.status === 'completed' && jobData.results) {
      try {
        const results = JSON.parse(jobData.results)
        if (results.structuredInsights && results.structuredInsights.probability) {
          probability = results.structuredInsights.probability
        }
      } catch (e) {
        console.error(`Error parsing job results: ${e}`)
      }
    }

    if (jobData.status === 'completed') {
      emailSubject = `Research Complete: ${jobData.focus_text || marketData?.question || 'Your research'}`
      emailContent = `
        <h1>Your Research is Complete!</h1>
        <p>Good news! We've completed your background research job.</p>
        
        <div style="margin: 20px 0; padding: 15px; border-left: 4px solid #0070f3; background-color: #f7f7f7;">
          <h2>${jobData.focus_text || 'Research'}</h2>
          <p><strong>Query:</strong> ${jobData.query}</p>
          <p><strong>Market:</strong> ${marketData?.question || jobData.market_id}</p>
          <p><strong>Probability:</strong> ${probability}</p>
          <p><strong>Completed:</strong> ${new Date(jobData.completed_at).toLocaleString()}</p>
        </div>

        <p>You can view the full results by returning to the market page.</p>
        
        <div style="margin-top: 40px; font-size: 12px; color: #666;">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      `
    } else {
      emailSubject = `Research Failed: ${jobData.focus_text || marketData?.question || 'Your research'}`
      emailContent = `
        <h1>Your Research Job Failed</h1>
        <p>We're sorry, but we encountered an issue with your background research job.</p>
        
        <div style="margin: 20px 0; padding: 15px; border-left: 4px solid #ff4040; background-color: #f7f7f7;">
          <h2>${jobData.focus_text || 'Research'}</h2>
          <p><strong>Query:</strong> ${jobData.query}</p>
          <p><strong>Market:</strong> ${marketData?.question || jobData.market_id}</p>
          <p><strong>Error:</strong> ${jobData.error_message || 'Unknown error'}</p>
        </div>

        <p>You may want to try again with a different focus area or query.</p>
        
        <div style="margin-top: 40px; font-size: 12px; color: #666;">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      `
    }

    // Send email notification
    console.log(`Sending email notification to ${email}`)
    const emailResponse = await resend.emails.send({
      from: "Research Notifications <onboarding@resend.dev>",
      to: [email],
      subject: emailSubject,
      html: emailContent,
    })

    console.log(`Email notification response:`, emailResponse)

    // Update notification_sent in database
    const { error: updateError } = await supabaseClient
      .from('research_jobs')
      .update({
        notification_sent: true,
      })
      .eq('id', jobId)

    if (updateError) {
      console.error(`Error updating notification status: ${updateError.message}`)
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email notification sent successfully', 
        data: emailResponse 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error(`Error sending notification: ${error.message}`)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
