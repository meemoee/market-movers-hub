
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
    const { jobId } = await req.json();
    
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing job ${jobId}`);
    
    // Update job status to processing
    await supabase.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'processing'
    });
    
    // Send realtime update about job status
    await supabase.channel('job-updates')
      .send({
        type: 'broadcast',
        event: 'job_update',
        topic: `job-${jobId}`,
        payload: { 
          status: 'processing',
          message: 'Job processing started' 
        }
      });
    
    // Start processing the job in the background
    const processJob = async () => {
      try {
        // Fetch job data
        const { data: job, error: jobError } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (jobError || !job) {
          console.error('Error fetching job:', jobError);
          throw new Error('Failed to fetch job data');
        }
        
        // Log progress
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: 'Starting research process...'
        });
        
        // Send realtime update
        await supabase.channel('job-updates')
          .send({
            type: 'broadcast',
            event: 'job_update',
            topic: `job-${jobId}`,
            payload: { 
              message: 'Starting research process...',
              current_iteration: 0,
              max_iterations: job.max_iterations
            }
          });
        
        // Start the research process by calling web-scrape function
        const queries = [
          `${job.query} latest information`,
          `${job.query} analysis`,
          `${job.query} statistics`
        ];
        
        if (job.focus_text) {
          queries.push(`${job.query} ${job.focus_text}`);
          queries.push(`${job.focus_text} analysis`);
        }
        
        // Update progress
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Generated ${queries.length} initial search queries`
        });
        
        // Send realtime update
        await supabase.channel('job-updates')
          .send({
            type: 'broadcast',
            event: 'job_update',
            topic: `job-${jobId}`,
            payload: { 
              message: `Generated ${queries.length} initial search queries`,
              current_iteration: 1,
              max_iterations: job.max_iterations,
              progress: (1 / job.max_iterations) * 100
            }
          });
        
        // Update job iteration
        await supabase
          .from('research_jobs')
          .update({ current_iteration: 1 })
          .eq('id', jobId);
        
        // Call web-scrape function
        const scrapingResponse = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            queries,
            marketId: job.market_id,
            focusText: job.focus_text
          })
        });
        
        if (!scrapingResponse.ok) {
          const errorText = await scrapingResponse.text();
          throw new Error(`Web scraping failed: ${errorText}`);
        }
        
        const scrapingData = await scrapingResponse.json();
        
        // Update progress
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: 'Web scraping completed, starting analysis...'
        });
        
        // Send realtime update
        await supabase.channel('job-updates')
          .send({
            type: 'broadcast',
            event: 'job_update',
            topic: `job-${jobId}`,
            payload: { 
              message: 'Web scraping completed, starting analysis...',
              current_iteration: 2,
              max_iterations: job.max_iterations,
              progress: (2 / job.max_iterations) * 100
            }
          });
        
        // Update job iteration
        await supabase
          .from('research_jobs')
          .update({ current_iteration: 2 })
          .eq('id', jobId);
        
        // Analyze the content
        const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-web-content`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            marketId: job.market_id,
            marketQuestion: job.query,
            webContent: scrapingData.results || []
          })
        });
        
        if (!analysisResponse.ok) {
          const errorText = await analysisResponse.text();
          throw new Error(`Content analysis failed: ${errorText}`);
        }
        
        const analysisData = await analysisResponse.json();
        
        // Save results
        const jobResults = {
          data: scrapingData.results || [],
          analysis: analysisData.analysis,
          structuredInsights: analysisData.structuredInsights || {
            probability: "Unknown",
            areasForResearch: []
          }
        };
        
        // Update research job with results
        await supabase.rpc('update_research_results', {
          job_id: jobId,
          result_data: jobResults
        });
        
        // Mark job as completed
        await supabase.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'completed'
        });
        
        // Update progress
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: 'Research completed successfully'
        });
        
        // Send realtime update
        await supabase.channel('job-updates')
          .send({
            type: 'broadcast',
            event: 'job_update',
            topic: `job-${jobId}`,
            payload: { 
              status: 'completed',
              message: 'Research completed successfully',
              current_iteration: job.max_iterations,
              max_iterations: job.max_iterations,
              progress: 100
            }
          });
        
        // Send email notification if requested
        if (job.notification_email && !job.notification_sent) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-research-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                jobId,
                email: job.notification_email,
                marketId: job.market_id,
                query: job.query
              })
            });
            
            // Mark notification as sent
            await supabase
              .from('research_jobs')
              .update({ notification_sent: true })
              .eq('id', jobId);
          } catch (notificationError) {
            console.error('Error sending notification:', notificationError);
          }
        }
        
      } catch (error) {
        console.error(`Error processing job ${jobId}:`, error);
        
        // Update job status to failed
        await supabase.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'failed',
          error_msg: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Update progress
        await supabase.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        
        // Send realtime update
        await supabase.channel('job-updates')
          .send({
            type: 'broadcast',
            event: 'job_update',
            topic: `job-${jobId}`,
            payload: { 
              status: 'failed',
              message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          });
      }
    };
    
    // Process job in the background
    EdgeRuntime.waitUntil(processJob());
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Job processing started in background",
        jobId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
