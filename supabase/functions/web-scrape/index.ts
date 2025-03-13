
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { corsHeaders } from '../_shared/cors.ts'
import { SSEMessage } from './types.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { description, marketId } = await req.json()

    if (!description) {
      return new Response(
        JSON.stringify({ error: 'Description parameter is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create a new research job
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .insert([
        { 
          market_id: marketId,
          query: description,
          status: 'processing',
          user_id: req.headers.get('x-user-id') // This would come from the client
        }
      ])
      .select('id')
      .single()

    if (jobError) {
      console.error('Error creating job:', jobError)
      return new Response(
        JSON.stringify({ error: 'Failed to create research job' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Update job status to processing
    await supabase.functions.invoke('update-job-status', {
      body: { jobId: job.id, status: 'processing' }
    })

    // Process the job asynchronously
    // We'll handle the actual research process in the background
    // and clients will poll get-job-status for updates
    processResearchJob(supabase, job.id, description).catch(err => {
      console.error('Error processing job:', err)
      // Update job to failed
      supabase
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'An unknown error occurred'
        })
        .eq('id', job.id)
    })

    // Return the job ID to the client
    return new Response(
      JSON.stringify({ jobId: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Function to process the research job asynchronously
async function processResearchJob(supabase: any, jobId: string, description: string) {
  try {
    // 1. Update progress - Generating queries
    await updateProgress(supabase, jobId, {
      step: 'queries',
      message: 'Generating search queries...',
      percentage: 10
    })

    // 2. Generate search queries
    const { data: queryData } = await supabase.functions.invoke('generate-queries', {
      body: { prompt: description }
    })

    const queries = queryData.queries || ['No queries generated']
    
    // 3. Update progress - Searching
    await updateProgress(supabase, jobId, {
      step: 'search',
      message: 'Searching the web...',
      percentage: 30
    })

    // 4. Perform searches
    const allResults: Array<{ url: string; title?: string; content: string }> = []
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      await updateProgress(supabase, jobId, {
        step: 'search',
        message: `Searching for "${query}"...`,
        percentage: 30 + Math.floor((i / queries.length) * 40)
      })
      
      const { data: searchResults } = await supabase.functions.invoke('brave-search', {
        body: { query }
      })
      
      if (searchResults && searchResults.results) {
        for (const result of searchResults.results) {
          allResults.push({
            url: result.url,
            title: result.title,
            content: result.description
          })
        }
      }
    }

    // 5. Update progress - Analyzing
    await updateProgress(supabase, jobId, {
      step: 'analyze',
      message: 'Analyzing results...',
      percentage: 80
    })

    // Store the search results
    await supabase
      .from('research_jobs')
      .update({
        results: {
          queries: queries,
          searchResults: allResults
        }
      })
      .eq('id', jobId)

    // 6. Start analysis if we have results
    if (allResults.length > 0) {
      // Update status to analyzing
      await supabase
        .from('research_jobs')
        .update({ status: 'analyzing' })
        .eq('id', jobId)

      // Analyze the content
      const { data: analysisData } = await supabase.functions.invoke('analyze-web-content', {
        body: { content: allResults, prompt: description, returnFormat: 'json' }
      })
      
      // 7. Store final results and complete the job
      await supabase
        .from('research_jobs')
        .update({
          results: {
            queries: queries,
            searchResults: allResults,
            analysis: analysisData
          },
          status: 'completed'
        })
        .eq('id', jobId)
    } else {
      // No results found
      await supabase
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: 'No search results found'
        })
        .eq('id', jobId)
    }
  } catch (error) {
    console.error('Research process error:', error)
    
    // Update job to failed
    await supabase
      .from('research_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'An unknown error occurred'
      })
      .eq('id', jobId)
    
    throw error
  }
}

// Helper function to update job progress
async function updateProgress(supabase: any, jobId: string, progress: { step: string; message: string; percentage?: number }) {
  try {
    await supabase.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: progress
    })
  } catch (error) {
    console.error('Failed to update progress:', error)
    // We'll continue even if updating progress fails
  }
}
