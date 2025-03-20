
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, query, maxIterations = 3, focusText, notificationEmail, action, jobId } = await req.json();
    
    // Handle action for checking job completion
    if (action === 'check_completion' && jobId) {
      console.log(`Received request to check completion status of job: ${jobId}`);
      
      // Get job details
      const { data: job, error: jobError } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (jobError) {
        throw new Error(`Error getting job: ${jobError.message}`);
      }
      
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }
      
      console.log(`Job status: ${job.status}, current iteration: ${job.current_iteration}, max iterations: ${job.max_iterations}`);
      
      // If the job is in processing state and has reached max iterations, complete it
      if (job.status === 'processing' && job.current_iteration >= job.max_iterations) {
        console.log(`Marking job ${jobId} as complete because it has reached max iterations.`);
        
        // Update job status to completed
        const { error: updateError } = await supabase
          .rpc('update_research_job_status', {
            job_id: jobId,
            new_status: 'completed'
          });
        
        if (updateError) {
          throw new Error(`Error completing job: ${updateError.message}`);
        }
        
        // Send notification email if provided
        if (job.notification_email && !job.notification_sent) {
          console.log(`Sending notification email to ${job.notification_email}`);
          
          try {
            await supabase.functions.invoke('send-research-notification', {
              body: { 
                jobId: job.id,
                email: job.notification_email,
                marketId: job.market_id
              }
            });
            
            // Mark notification as sent
            await supabase
              .from('research_jobs')
              .update({ notification_sent: true })
              .eq('id', job.id);
              
            console.log(`Notification email sent to ${job.notification_email}`);
          } catch (emailError) {
            console.error('Error sending notification email:', emailError);
          }
        }
        
        return new Response(
          JSON.stringify({ 
            message: `Job ${jobId} marked as complete.`,
            status: 'completed'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          message: `Job ${jobId} is already in ${job.status} status.`,
          status: job.status
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    // Create a new research job
    console.log(`Creating research job for market ID: ${marketId} with query: ${query}`);

    const { data: researchJob, error: researchError } = await supabase
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: [],
        iterations: [],
        results: null,
        error_message: null,
        user_id: (await supabase.auth.getUser()).data?.user?.id,
        focus_text: focusText,
        notification_email: notificationEmail,
        notification_sent: false
      })
      .select()
      .single();

    if (researchError) {
      console.error('Error creating research job:', researchError);
      throw new Error(researchError.message);
    }

    const jobId = researchJob.id;
    console.log(`Research job created with ID: ${jobId}`);

    // Call the web-research function
    console.log(`Invoking web-research function for job ID: ${jobId}`);
    
    const { data: webResearchResult, error: webResearchError } = await supabase.functions.invoke('web-research', {
      body: {
        query: query,
        focusText: focusText
      }
    });

    if (webResearchError) {
      console.error('Error invoking web-research function:', webResearchError);
      
      // Update the research job with the error message
      await supabase
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: webResearchError.message
        })
        .eq('id', jobId);
        
      throw new Error(webResearchError.message);
    }

    console.log(`Web-research function invoked successfully for job ID: ${jobId}`);

    return new Response(
      JSON.stringify({ jobId: jobId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
