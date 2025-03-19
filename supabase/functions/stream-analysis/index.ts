import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import "https://deno.land/x/xhr@0.1.0/mod.ts"

// SSE headers for streaming
const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      }
    })
  }

  try {
    // First check if it's a POST request (initial connection setup)
    if (req.method === 'POST') {
      const { jobId, iterationNumber } = await req.json()
      
      if (!jobId || !iterationNumber) {
        return new Response(
          JSON.stringify({ error: 'jobId and iterationNumber are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
      
      // Store the connection params in KV (could use a different method if KV not available)
      await Deno.env.get('KV_REST_API_URL') ? 
        storeConnectionParams(jobId, iterationNumber) : 
        console.log('KV not available, skipping connection param storage')
      
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // For GET requests, establish the SSE connection
    const url = new URL(req.url)
    const jobId = url.searchParams.get('jobId')
    const iterationNumber = url.searchParams.get('iterationNumber')
    
    if (!jobId || !iterationNumber) {
      return new Response(
        JSON.stringify({ error: 'jobId and iterationNumber are required query parameters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Create a readable stream to send SSE events
    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          console.log(`SSE connection established for job ${jobId}, iteration ${iterationNumber}`)
          
          // Initialize Supabase client
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          )
          
          // Send initial keepalive
          controller.enqueue('event: keepalive\ndata: connected\n\n')
          
          // First, check if a streaming analysis is already in progress
          const { data: jobData, error: jobError } = await supabaseClient
            .from('research_jobs')
            .select('iterations, status')
            .eq('id', jobId)
            .single()
          
          if (jobError) {
            console.error(`Error fetching job ${jobId}:`, jobError)
            controller.enqueue(`data: Error fetching job: ${jobError.message}\n\n`)
            controller.close()
            return
          }
          
          if (!jobData || !jobData.iterations) {
            console.error(`No iterations found for job ${jobId}`)
            controller.enqueue(`data: No iterations found\n\n`)
            controller.close()
            return
          }
          
          // Find the specified iteration
          const iterationIndex = jobData.iterations.findIndex(
            (iter: any) => iter.iteration === parseInt(iterationNumber)
          )
          
          if (iterationIndex === -1) {
            console.error(`Iteration ${iterationNumber} not found for job ${jobId}`)
            controller.enqueue(`data: Iteration not found\n\n`)
            controller.close()
            return
          }
          
          // If analysis already exists, send it immediately
          if (jobData.iterations[iterationIndex].analysis) {
            const existingAnalysis = jobData.iterations[iterationIndex].analysis
            console.log(`Sending existing analysis for job ${jobId}, iteration ${iterationNumber}`)
            
            // Split existing analysis into smaller chunks to simulate streaming
            const chunkSize = 100 // characters
            for (let i = 0; i < existingAnalysis.length; i += chunkSize) {
              const chunk = existingAnalysis.substring(i, i + chunkSize)
              controller.enqueue(`data: ${chunk}\n\n`)
              await new Promise(resolve => setTimeout(resolve, 10)) // Small delay between chunks
            }
          }
          
          // If job is still processing, set up a subscription for real-time updates
          if (jobData.status === 'processing') {
            console.log(`Setting up real-time subscription for job ${jobId}`)
            
            // Subscribe to the analysis_stream table
            const subscription = supabaseClient
              .channel('analysis_stream_changes')
              .on(
                'postgres_changes',
                {
                  event: 'INSERT',
                  schema: 'public',
                  table: 'analysis_stream',
                  filter: `job_id=eq.${jobId},iteration=eq.${iterationNumber}`
                },
                (payload) => {
                  console.log(`New chunk received for job ${jobId}, iteration ${iterationNumber}`)
                  // Send the chunk to the client
                  controller.enqueue(`data: ${payload.new.chunk}\n\n`)
                }
              )
              .subscribe()
            
            // Keep the connection open for a reasonable time (5 minutes max)
            const timeout = setTimeout(() => {
              console.log(`Stream timeout for job ${jobId}, iteration ${iterationNumber}`)
              subscription.unsubscribe()
              controller.close()
            }, 5 * 60 * 1000)
            
            // Clean up on client disconnect
            req.signal.addEventListener('abort', () => {
              console.log(`Client disconnected for job ${jobId}, iteration ${iterationNumber}`)
              clearTimeout(timeout)
              subscription.unsubscribe()
              controller.close()
            })
          } else {
            // If job is not processing, we've sent all available data
            console.log(`Job ${jobId} is not processing (status: ${jobData.status}), closing stream`)
            controller.close()
          }
        } catch (error) {
          console.error('Stream error:', error)
          controller.enqueue(`data: Error: ${error.message}\n\n`)
          controller.close()
        }
      }
    })
    
    return new Response(stream, { headers: sseHeaders })
    
  } catch (error) {
    console.error('Error in stream-analysis function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Helper function to store connection parameters in KV
async function storeConnectionParams(jobId: string, iterationNumber: number) {
  try {
    const kvUrl = Deno.env.get('KV_REST_API_URL')
    const kvToken = Deno.env.get('KV_REST_API_TOKEN')
    
    if (!kvUrl || !kvToken) {
      console.log('KV environment variables not set')
      return
    }
    
    const response = await fetch(`${kvUrl}/set`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: `stream:${jobId}:${iterationNumber}`,
        value: { 
          jobId,
          iterationNumber,
          connectedAt: new Date().toISOString()
        }
      })
    })
    
    if (!response.ok) {
      console.error('Failed to store connection params in KV:', await response.text())
    }
  } catch (error) {
    console.error('Error storing connection params in KV:', error)
  }
}
