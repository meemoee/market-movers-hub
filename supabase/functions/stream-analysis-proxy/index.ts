
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
}

// Constants
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Create a Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Function to save the accumulated content to the database after streaming
async function saveContentToDatabase(
  jobId: string, 
  iteration: number, 
  analysisContent: string, 
  reasoningContent: string
) {
  try {
    console.log(`Saving content to database for job ${jobId}, iteration ${iteration}`)
    
    // Update the specific iteration with the accumulated content
    const { error } = await supabase.rpc('update_iteration_field', {
      job_id: jobId,
      iteration_num: iteration,
      field_key: 'analysis',
      field_value: analysisContent
    })
    
    if (error) {
      console.error(`Error updating analysis field: ${error.message}`)
      return
    }
    
    // If reasoning content exists, update that field too
    if (reasoningContent) {
      const { error: reasoningError } = await supabase.rpc('update_iteration_field', {
        job_id: jobId,
        iteration_num: iteration,
        field_key: 'reasoning',
        field_value: reasoningContent
      })
      
      if (reasoningError) {
        console.error(`Error updating reasoning field: ${reasoningError.message}`)
      }
    }
    
    // Update a field to signal completion
    await supabase
      .from('research_jobs')
      .update({ 
        current_iteration: iteration,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
    
    console.log(`Successfully saved content for job ${jobId}, iteration ${iteration}`)
  } catch (error) {
    console.error(`Error in saveContentToDatabase: ${error.message}`)
  }
}

// Main function that processes the request and streams to the client
async function streamResearchAnalysis(req: Request): Promise<Response> {
  try {
    const { jobId, iteration } = await req.json()
    
    if (!jobId || iteration === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: jobId and iteration' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Fetch the research job data to get context
    const { data: jobData, error: jobError } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    
    if (jobError || !jobData) {
      console.error(`Error fetching job data: ${jobError?.message || 'Job not found'}`)
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Get previous iterations content to build context
    const prevIterations = jobData.iterations.filter((iter: any) => iter.iteration < iteration)
    const currentIterationData = jobData.iterations.find((iter: any) => iter.iteration === iteration)
    
    if (!currentIterationData) {
      return new Response(JSON.stringify({ error: 'Iteration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Build prompt for OpenRouter based on previous iterations and current data
    const prompt = buildPrompt(jobData, prevIterations, currentIterationData)
    
    // Create a streaming response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    
    // Call OpenRouter with streaming enabled
    const openRouterResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-opus:beta',
        messages: [
          { 
            role: 'system', 
            content: prompt.systemPrompt
          },
          { 
            role: 'user', 
            content: prompt.userPrompt 
          }
        ],
        stream: true,
        temperature: 0.1,
        reasoning: {
          exclude: false,
          model: "anthropic/claude-3-opus:beta"
        }
      })
    })
    
    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text()
      console.error(`OpenRouter API error: ${openRouterResponse.status} ${errorText}`)
      await writer.write(`data: ${JSON.stringify({ error: `API error: ${openRouterResponse.status}` })}\n\n`)
      await writer.close()
      return new Response(readable, { headers: corsHeaders })
    }
    
    if (!openRouterResponse.body) {
      console.error('No response body from OpenRouter')
      await writer.write(`data: ${JSON.stringify({ error: 'No response body from API' })}\n\n`)
      await writer.close()
      return new Response(readable, { headers: corsHeaders })
    }
    
    // Store the full accumulated content for database saving
    let accumulatedAnalysis = ''
    let accumulatedReasoning = ''
    
    // Process the stream from OpenRouter
    const reader = openRouterResponse.body.getReader()
    const decoder = new TextDecoder()
    
    // Function to process the stream
    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            break
          }
          
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const jsonData = JSON.parse(line.substring(6))
                
                // Check if this is a reasoning chunk or content chunk
                if (jsonData.reasoning?.content) {
                  const reasoningChunk = jsonData.reasoning.content
                  accumulatedReasoning += reasoningChunk
                  
                  // Send to client with type
                  await writer.write(`data: ${JSON.stringify({
                    type: 'reasoning',
                    content: reasoningChunk
                  })}\n\n`)
                } 
                
                // Check for regular content
                if (jsonData.choices?.[0]?.delta?.content) {
                  const contentChunk = jsonData.choices[0].delta.content
                  accumulatedAnalysis += contentChunk
                  
                  // Send to client with type
                  await writer.write(`data: ${JSON.stringify({
                    type: 'analysis',
                    content: contentChunk
                  })}\n\n`)
                }
              } catch (e) {
                console.error(`Error parsing JSON from stream: ${e.message}, line: ${line}`)
              }
            }
          }
        }
        
        // Send completion event
        await writer.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`)
        
        // Close the writer
        await writer.close()
        
        // Save the content to database after streaming is complete (do this asynchronously)
        const backgroundSave = async () => {
          await saveContentToDatabase(jobId, iteration, accumulatedAnalysis, accumulatedReasoning)
        }
        
        // Don't wait for this to complete before returning the response
        EdgeRuntime.waitUntil(backgroundSave())
        
      } catch (error) {
        console.error(`Error in processStream: ${error.message}`)
        await writer.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        await writer.close()
      }
    }
    
    // Start processing the stream without awaiting
    processStream()
    
    // Return the readable stream to the client immediately
    return new Response(readable, { headers: corsHeaders })
    
  } catch (error) {
    console.error(`Error in streamResearchAnalysis: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Helper function to build prompts for OpenRouter
function buildPrompt(
  jobData: any, 
  prevIterations: any[], 
  currentIteration: any
) {
  // Basic system prompt template
  const systemPrompt = `You are an expert AI research assistant tasked with analyzing web research sources and providing insights.
Your goal is to provide a comprehensive analysis of the information found in the sources from the current iteration.

If this is not the first iteration, build upon previous iterations' analysis.
Be factual, accurate, and thorough in your analysis.
Separate your reasoning from your final analysis. The reasoning should explain your thought process.
Highlight key information, trends, and insights relevant to the research question.`

  // Format sources from the current iteration
  const sourcesText = currentIteration.results
    ? currentIteration.results.map((r: any, i: number) => 
        `SOURCE ${i+1}: ${r.url}\n${r.content}\n---\n`
      ).join('\n')
    : 'No sources available.'

  // Format previous iterations' analyses
  const previousAnalysesText = prevIterations.length > 0
    ? prevIterations.map((iter: any) => 
        `ITERATION ${iter.iteration} ANALYSIS:\n${iter.analysis || 'No analysis available.'}\n---\n`
      ).join('\n')
    : 'No previous iterations.';

  // User prompt that includes the specific research context
  const userPrompt = `
RESEARCH QUESTION: ${jobData.query}
${jobData.focus_text ? `RESEARCH FOCUS: ${jobData.focus_text}\n` : ''}
CURRENT ITERATION: ${currentIteration.iteration}

${prevIterations.length > 0 ? `PREVIOUS ITERATIONS:\n${previousAnalysesText}\n` : ''}

CURRENT SOURCES TO ANALYZE FOR ITERATION ${currentIteration.iteration}:
${sourcesText}

Please analyze these sources thoroughly. Provide insights relevant to the research question${jobData.focus_text ? ' and research focus' : ''}.
In the current iteration, look for new information that was not covered in previous iterations.
`

  return { systemPrompt, userPrompt }
}

// Main serve function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle the research analysis streaming request
  if (req.method === 'POST') {
    return streamResearchAnalysis(req)
  }

  // Handle any other requests
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
