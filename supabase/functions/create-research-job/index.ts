
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mock function to simulate web research
async function performWebResearch(jobId: string, query: string, marketId: string, maxIterations: number) {
  console.log(`Starting background research for job ${jobId}`)
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Update job status to processing
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'processing'
    })
    
    // Log start
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Starting research for: ${query}`)
    })
    
    // Track all previous queries to avoid repetition
    const previousQueries: string[] = [];
    
    // Simulate iterations
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Processing iteration ${i} for job ${jobId}`)
      
      // Update current iteration
      await supabaseClient
        .from('research_jobs')
        .update({ current_iteration: i })
        .eq('id', jobId)
      
      // Add progress log for this iteration
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Starting iteration ${i} of ${maxIterations}`)
      })
      
      // Generate search queries
      try {
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Generating search queries for iteration ${i}`)
        })
        
        // Call the generate-queries function to get real queries
        const generateQueriesResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              query,
              marketId,
              iteration: i,
              previousQueries
            })
          }
        );
        
        if (!generateQueriesResponse.ok) {
          throw new Error(`Failed to generate queries: ${generateQueriesResponse.statusText}`);
        }
        
        const { queries } = await generateQueriesResponse.json();
        console.log(`Generated ${queries.length} queries for iteration ${i}:`, queries);
        
        // Add generated queries to previous queries to avoid repetition
        previousQueries.push(...queries);
        
        // Store the queries in the iteration data
        const iterationData = {
          iteration: i,
          queries: queries,
          results: []
        };
        
        // Append the iteration data to the research job
        await supabaseClient.rpc('append_research_iteration', {
          job_id: jobId,
          iteration_data: iterationData
        });
        
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Generated ${queries.length} search queries for iteration ${i}`)
        })
      } catch (error) {
        console.error(`Error generating queries for job ${jobId}:`, error);
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Error generating queries: ${error.message}`)
        });
      }
      
      // Simulate web scraping
      await new Promise(resolve => setTimeout(resolve, 3000))
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Completed web searches for iteration ${i}`)
      })
      
      // Simulate analysis
      await new Promise(resolve => setTimeout(resolve, 2000))
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Completed analysis for iteration ${i}`)
      })
    }
    
    // Simulate final results
    const mockResults = {
      data: [
        {
          url: 'https://example.com/result1',
          title: 'Example Result 1',
          content: 'This is a simulated result for the research job.'
        },
        {
          url: 'https://example.com/result2',
          title: 'Example Result 2',
          content: 'This is another simulated result with different information.'
        }
      ],
      analysis: 'Based on the simulated research, we found interesting information that suggests...'
    }
    
    // Update the job with results
    await supabaseClient.rpc('update_research_results', {
      job_id: jobId,
      result_data: JSON.stringify(mockResults)
    })
    
    // Mark job as complete
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'completed'
    })
    
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify('Research completed successfully!')
    })
    
    console.log(`Completed background research for job ${jobId}`)
  } catch (error) {
    console.error(`Error in background job ${jobId}:`, error)
    
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      // Mark job as failed
      await supabaseClient.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed',
        error_msg: error.message || 'Unknown error'
      })
      
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Research failed: ${error.message || 'Unknown error'}`)
      })
    } catch (e) {
      console.error(`Failed to update job ${jobId} status:`, e)
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { marketId, query, maxIterations = 3 } = await req.json()
    
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'marketId and query are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Create a new job record
    const { data: jobData, error: jobError } = await supabaseClient
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: [],
        iterations: []
      })
      .select('id')
      .single()
    
    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`)
    }
    
    const jobId = jobData.id
    
    // Start the background process without EdgeRuntime
    // Use standard Deno setTimeout for async operation instead
    setTimeout(() => {
      performWebResearch(jobId, query, marketId, maxIterations).catch(err => {
        console.error(`Background research failed: ${err}`);
      });
    }, 0);
    
    // Return immediate response with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Research job started', 
        jobId: jobId 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
