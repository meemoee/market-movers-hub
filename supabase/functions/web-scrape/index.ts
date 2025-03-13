
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

    // Set up SSE response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Send an initial message
        const message: SSEMessage = {
          type: 'message',
          message: 'Starting research...',
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`))

        try {
          // Process the job (this would normally be done by a background process)
          // For this implementation, we'll do it synchronously to maintain the existing behavior
          
          // Update job status to processing
          await supabase.functions.invoke('update-job-status', {
            body: { jobId: job.id, status: 'processing' }
          })

          // 1. Generate search queries
          const queryMessage: SSEMessage = {
            type: 'progress',
            progress: {
              step: 'queries',
              message: 'Generating search queries...',
              percentage: 10
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(queryMessage)}\n\n`))

          const { data: queryData } = await supabase.functions.invoke('generate-queries', {
            body: { prompt: description }
          })

          const queries = queryData.queries || ['No queries generated']
          
          // 2. Perform web search for each query
          const searchMessage: SSEMessage = {
            type: 'progress',
            progress: {
              step: 'search',
              message: 'Searching the web...',
              percentage: 30
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(searchMessage)}\n\n`))

          // Track all results
          const allResults: Array<{ url: string; title?: string; content: string }> = []
          
          for (let i = 0; i < queries.length; i++) {
            const query = queries[i]
            const queryProgressMessage: SSEMessage = {
              type: 'progress',
              progress: {
                step: 'search',
                message: `Searching for "${query}"...`,
                percentage: 30 + Math.floor((i / queries.length) * 40)
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(queryProgressMessage)}\n\n`))
            
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

          // 3. Analyze the content
          const analyzeMessage: SSEMessage = {
            type: 'progress',
            progress: {
              step: 'analyze',
              message: 'Analyzing results...',
              percentage: 80
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(analyzeMessage)}\n\n`))

          // Send the collected data for analysis
          if (allResults.length > 0) {
            const { data: analysisData } = await supabase.functions.invoke('analyze-web-content', {
              body: { content: allResults, prompt: description, returnFormat: 'json' }
            })
            
            // 4. Send final results
            const resultMessage: SSEMessage = {
              type: 'results',
              data: allResults,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultMessage)}\n\n`))

            // 5. Store results in the job
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
              .eq('id', job.id)
          } else {
            // No results found
            const errorMessage: SSEMessage = {
              type: 'error',
              message: 'No search results found',
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`))
            
            // Update job to failed
            await supabase
              .from('research_jobs')
              .update({
                status: 'failed',
                error: 'No search results found'
              })
              .eq('id', job.id)
          }
        } catch (error) {
          console.error('Research process error:', error)
          
          const errorMessage: SSEMessage = {
            type: 'error',
            message: error instanceof Error ? error.message : 'An unknown error occurred',
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`))
          
          // Update job to failed
          await supabase
            .from('research_jobs')
            .update({
              status: 'failed',
              error: error instanceof Error ? error.message : 'An unknown error occurred'
            })
            .eq('id', job.id)
        }
        
        // Close the stream
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
