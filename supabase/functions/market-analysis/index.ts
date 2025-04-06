
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, chatHistory, jobId, isFinalAnalysis = false, iterationNumber = null } = await req.json()
    console.log('Received request:', { message, chatHistory, jobId, isFinalAnalysis, iterationNumber })

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set')
    }

    console.log('Making request to OpenRouter API...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. Be concise and clear in your responses."
          },
          {
            role: "user",
            content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
          }
        ],
        stream: true
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    // If this is for streaming to a research job, transform the stream to write to database
    if (jobId) {
      console.log(`Streaming to research job ${jobId}, ${isFinalAnalysis ? 'final analysis' : `iteration ${iterationNumber}`}`)
      
      // Create a new ReadableStream to transform the original stream
      const { readable, writable } = new TransformStream()
      
      // Process the stream in the background without blocking response
      EdgeRuntime.waitUntil((async () => {
        try {
          const reader = openRouterResponse.body?.getReader()
          const writer = writable.getWriter()
          
          if (!reader) {
            throw new Error('Failed to get reader from response')
          }

          let accumulatedText = ''
          let chunkCounter = 0
          const chunkInterval = 5 // Save to DB every 5 chunks

          while (true) {
            const { done, value } = await reader.read()
            
            if (done) {
              console.log('Stream complete')
              writer.close()
              break
            }
            
            // Forward the chunk to our output stream
            await writer.write(value)
            
            // Process the chunk for database storage
            const chunkText = new TextDecoder().decode(value)
            const lines = chunkText.split('\n').filter(line => line.trim() !== '')
            
            // Process each SSE line
            for (const line of lines) {
              if (line.startsWith('data:')) {
                let data = line.slice(5).trim()
                if (data === '[DONE]') continue
                
                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content || ''
                  
                  if (content) {
                    accumulatedText += content
                    chunkCounter++
                    
                    // Store the chunk in analysis_stream table
                    if (jobId) {
                      // Use iteration 0 for final analysis
                      const iteration = isFinalAnalysis ? 0 : iterationNumber
                      
                      // Store in analysis_stream right away
                      const streamResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/append_analysis_chunk`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
                        },
                        body: JSON.stringify({
                          job_id: jobId,
                          iteration: iteration,
                          chunk: content,
                          seq: chunkCounter
                        })
                      })
                      
                      if (!streamResponse.ok) {
                        console.error('Failed to append to analysis_stream:', await streamResponse.text())
                      }
                      
                      // Every few chunks, update the main fields
                      if (chunkCounter % chunkInterval === 0) {
                        if (isFinalAnalysis) {
                          // Update final_analysis_stream field
                          const updateResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/research_jobs?id=eq.${jobId}`, {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                              'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
                              'Prefer': 'return=minimal'
                            },
                            body: JSON.stringify({
                              final_analysis_stream: accumulatedText,
                            })
                          })
                          
                          if (!updateResponse.ok) {
                            console.error('Failed to update final_analysis_stream:', await updateResponse.text())
                          }
                        } else {
                          // For iteration analysis, update the iterations array
                          const appendResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/append_iteration_field_text`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                              'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
                            },
                            body: JSON.stringify({
                              job_id: jobId,
                              iteration_num: iterationNumber,
                              field_key: 'analysis',
                              append_text: content
                            })
                          })
                          
                          if (!appendResponse.ok) {
                            console.error('Failed to append to iteration:', await appendResponse.text())
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error('Error parsing SSE:', e)
                }
              }
            }
          }
          
          // Final update at the end
          if (jobId) {
            if (isFinalAnalysis) {
              // Final update of final_analysis_stream field
              const finalUpdateResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/research_jobs?id=eq.${jobId}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  final_analysis_stream: accumulatedText,
                })
              })
              
              if (!finalUpdateResponse.ok) {
                console.error('Failed to update final final_analysis_stream:', await finalUpdateResponse.text())
              }
              
              // Also update the results field for backward compatibility
              try {
                // First get the current results
                const getResultsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/research_jobs?id=eq.${jobId}&select=results`, {
                  headers: {
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
                  }
                })
                
                if (!getResultsResponse.ok) {
                  throw new Error(`Failed to get results: ${await getResultsResponse.text()}`)
                }
                
                const resultsData = await getResultsResponse.json()
                const currentResults = resultsData[0]?.results || {}
                
                // Update the results with the new analysis
                const updateResultsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/update_research_results`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
                  },
                  body: JSON.stringify({
                    job_id: jobId,
                    result_data: {
                      ...currentResults,
                      analysis: accumulatedText
                    }
                  })
                })
                
                if (!updateResultsResponse.ok) {
                  console.error('Failed to update results:', await updateResultsResponse.text())
                }
              } catch (e) {
                console.error('Error updating results:', e)
              }
            }
          }
          
          console.log(`Stream processing complete, ${chunkCounter} chunks processed`)
        } catch (error) {
          console.error('Error processing stream:', error)
          writable.abort(error)
        }
      })())
      
      // Return the transformed stream
      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    // Return the stream directly without transformation
    return new Response(openRouterResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in market-analysis function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})
