import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { jobId, iterationNumber } = await req.json()
    
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Set up streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Get job data from Supabase
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          )
          
          const { data: job, error: jobError } = await supabaseClient
            .from('research_jobs')
            .select('*')
            .eq('id', jobId)
            .single()
            
          if (jobError) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: jobError.message })))
            controller.close()
            return
          }
          
          // Get current iteration data
          const currentIteration = iterationNumber || job.current_iteration
          
          // Extract data needed for analysis
          const iterations = job.iterations || []
          const currentIterationData = iterations.find(i => i.iteration === currentIteration)
          
          if (!currentIterationData) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: 'Iteration not found' })))
            controller.close()
            return
          }
          
          // Combine search results for the current iteration
          const results = currentIterationData.results || []
          const combinedContent = results
            .map(result => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`)
            .join('\n\n')

          // Get previous analyses for context
          const previousAnalyses = iterations
            .filter(i => i.iteration < currentIteration && i.analysis)
            .map(i => i.analysis)

          // Build the prompt (similar to generateAnalysis in create-research-job)
          const prompt = `As a market research analyst, analyze the following web content to assess relevant information about this query: "${job.query}"

Content to analyze:
${combinedContent.slice(0, 20000)}
${job.focus_text ? `\nFOCUS AREA: "${job.focus_text}"\n` : ''}
${previousAnalyses.length ? `\nPREVIOUS ANALYSES:\n${previousAnalyses.join('\n\n')}\n` : ''}

Please provide:
1. Key Facts and Insights
2. Evidence Assessment
3. Probability Factors
4. Areas for Further Research
5. Conclusions

Present in a structured format with clear sections and bullet points where appropriate.`

          // Call OpenRouter with streaming enabled
          const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
          
          if (!openRouterKey) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: 'OpenRouter API key not found' })))
            controller.close()
            return
          }

          const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
              "X-Title": "Market Research App",
            },
            body: JSON.stringify({
              model: "google/gemini-flash-1.5",
              messages: [
                {
                  role: "system",
                  content: `You are an expert market research analyst who specializes in providing insightful analysis.`
                },
                {
                  role: "user",
                  content: prompt
                }
              ],
              temperature: 0.3,
              stream: true // Enable streaming!
            })
          })

          if (!openRouterResponse.ok) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: `OpenRouter API error: ${openRouterResponse.status}` })))
            controller.close()
            return
          }

          const reader = openRouterResponse.body?.getReader()
          if (!reader) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: 'Failed to get reader from response' })))
            controller.close()
            return
          }

          // Track accumulated text for database updates
          let accumulatedText = ''
          
          // Process the stream
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = new TextDecoder().decode(value)
            const lines = chunk.split('\n')
            
            for (const line of lines) {
              if (line.trim().startsWith('data: ')) {
                const data = line.trim().substring(6)
                if (data === '[DONE]') continue
                
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                    const content = parsed.choices[0].delta.content
                    accumulatedText += content
                    
                    // Forward content to client
                    controller.enqueue(encoder.encode(content))
                    
                    // Update database with accumulated text
                    const updatedIterations = [...iterations]
                    const iterIndex = updatedIterations.findIndex(i => i.iteration === currentIteration)
                    
                    if (iterIndex >= 0) {
                      updatedIterations[iterIndex].analysis = accumulatedText
                      await supabaseClient
                        .from('research_jobs')
                        .update({ iterations: updatedIterations })
                        .eq('id', jobId)
                    }
                  }
                } catch (e) {
                  console.error('Error parsing streaming data:', e)
                }
              }
            }
          }
          
          controller.close()
        } catch (error) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: error.message })))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
