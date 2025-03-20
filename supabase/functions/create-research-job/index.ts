
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY is not defined in environment variables')
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Supabase credentials are not defined in environment variables')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QueryParams {
  iterations?: number;
  query?: string;
  marketId?: string;
  previousResults?: string;
  userId?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Parse query parameters from request
  try {
    const { iterations = 3, query, marketId, previousResults, userId } = await req.json() as QueryParams
    
    // Validate required parameters
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Creating research job for query: ${query}, marketId: ${marketId}, iterations: ${iterations}`)

    try {
      const { data: jobData, error: jobError } = await createResearchJob(query, iterations, marketId, userId)
      
      if (jobError) {
        throw new Error(`Error creating job: ${jobError.message}`)
      }
      
      if (!jobData?.id) {
        throw new Error('No job ID returned from job creation')
      }

      const jobId = jobData.id
      console.log(`Created job with ID: ${jobId}`)

      await appendProgress(jobId, `Starting research job for query: ${query}`)
      await appendProgress(jobId, `Planning to run ${iterations} iterations`)

      // Begin processing the first iteration
      await processIteration(jobId, 1, query, previousResults, marketId)

      return new Response(
        JSON.stringify({ success: true, jobId: jobId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      console.error('Error in job processing:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Error parsing request:', error)
    return new Response(
      JSON.stringify({ error: 'Invalid request format' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Supabase client implementation
const createSupabaseClient = () => {
  return {
    from: (table: string) => ({
      insert: (data: any) => {
        return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(data)
        })
        .then(async (response) => {
          if (!response.ok) {
            const errorBody = await response.text()
            throw new Error(`Error inserting data: ${response.status} ${errorBody}`)
          }
          return response.json().then(data => ({ data, error: null }))
        })
        .catch(error => ({ data: null, error }))
      }),
      select: (columns: string) => ({
        eq: (column: string, value: any) => {
          return fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${columns}&${column}=eq.${value}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY
            }
          })
          .then(async (response) => {
            if (!response.ok) {
              const errorBody = await response.text()
              throw new Error(`Error selecting data: ${response.status} ${errorBody}`)
            }
            return response.json().then(data => ({ data, error: null }))
          })
          .catch(error => ({ data: null, error }))
        }
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => {
          return fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(data)
          })
          .then(async (response) => {
            if (!response.ok) {
              const errorBody = await response.text()
              throw new Error(`Error updating data: ${response.status} ${errorBody}`)
            }
            return response.json().then(data => ({ data, error: null }))
          })
          .catch(error => ({ data: null, error }))
        }
      })
    }),
    rpc: (functionName: string, params: any = {}) => {
      return fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY
        },
        body: JSON.stringify(params)
      })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`Error calling RPC: ${response.status} ${errorBody}`)
        }
        return response.json().then(data => ({ data, error: null }))
      })
      .catch(error => ({ data: null, error }))
    }
  }
}

// Create a research job in the database
async function createResearchJob(query: string, maxIterations: number, marketId?: string, userId?: string) {
  const supabase = createSupabaseClient()
  
  const job = {
    query,
    status: 'processing',
    max_iterations: maxIterations,
    current_iteration: 0,
    market_id: marketId || null,
    iterations: [],
    progress_log: [],
    results: null,
    user_id: userId || null,
    created_at: new Date().toISOString()
  }

  return await supabase.from('research_jobs').insert(job)
}

// Append a progress message to the job
async function appendProgress(jobId: string, message: string) {
  const supabase = createSupabaseClient()
  console.log(`Job ${jobId}: ${message}`)
  
  try {
    const result = await supabase.rpc('append_progress_log', {
      job_id: jobId,
      log_message: message
    })
    
    if (result.error) {
      console.error(`Error appending progress: ${result.error.message}`)
    }
    
    return result
  } catch (error) {
    console.error(`Exception in appendProgress: ${error}`)
    throw error
  }
}

// Update job status
async function updateJobStatus(jobId: string, status: string, errorMessage?: string) {
  const supabase = createSupabaseClient()
  console.log(`Updating job ${jobId} status to: ${status}${errorMessage ? ` with error: ${errorMessage}` : ''}`)
  
  try {
    const result = await supabase.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: status,
      error_msg: errorMessage || null
    })
    
    if (result.error) {
      console.error(`Error updating job status: ${result.error.message}`)
    }
    
    return result
  } catch (error) {
    console.error(`Exception in updateJobStatus: ${error}`)
    throw error
  }
}

// Update job iteration
async function updateJobIteration(jobId: string, iteration: number) {
  const supabase = createSupabaseClient()
  console.log(`Updating job ${jobId} iteration to: ${iteration}`)
  
  try {
    const result = await supabase.from('research_jobs').update({
      current_iteration: iteration
    }).eq('id', jobId)
    
    if (result.error) {
      console.error(`Error updating job iteration: ${result.error.message}`)
    }
    
    return result
  } catch (error) {
    console.error(`Exception in updateJobIteration: ${error}`)
    throw error
  }
}

// Append iteration data to job
async function appendIteration(jobId: string, iterationData: any) {
  const supabase = createSupabaseClient()
  console.log(`Appending iteration data to job ${jobId}:`, JSON.stringify(iterationData).substring(0, 200) + "...")
  
  try {
    const result = await supabase.rpc('append_research_iteration', {
      job_id: jobId,
      iteration_data: iterationData
    })
    
    if (result.error) {
      console.error(`Error appending iteration: ${result.error.message}`)
    }
    
    return result
  } catch (error) {
    console.error(`Exception in appendIteration: ${error}`)
    throw error
  }
}

// Generate search queries for the current iteration
async function generateQueries(query: string, iteration: number, previousResults?: string) {
  console.log(`Generating queries for iteration ${iteration}, query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`)
  
  try {
    const systemPrompt = `You are a research assistant tasked with generating search queries to find information about a specific question or topic.
For iteration ${iteration}, generate a list of 3-5 search queries that would help gather relevant information.
${iteration > 1 && previousResults ? 'Consider the previous analysis and focus on aspects that need more investigation.' : ''}
Return ONLY a JSON array of query strings. For example: ["query 1", "query 2", "query 3"]`

    const queryGenBody = {
      model: "deepseek/deepseek-r1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Question: ${query}\n${iteration > 1 && previousResults ? `Previous analysis: ${previousResults}` : ''}` }
      ],
      temperature: 0.5,
      max_tokens: 500
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryGenBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Error generating queries: ${response.status} ${error}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || "[]"
    
    let queries: string[] = []
    
    try {
      if (content.includes('[') && content.includes(']')) {
        // Extract array part if there's other text
        const arrayMatch = content.match(/\[[\s\S]*?\]/)
        const arrayText = arrayMatch ? arrayMatch[0] : content
        queries = JSON.parse(arrayText)
      } else {
        // Try to parse as a direct array
        queries = JSON.parse(content)
      }
    } catch (e) {
      console.error(`Error parsing queries JSON: ${e.message}, content: ${content}`)
      
      // Fallback: try to extract strings that look like queries
      const lines = content.split('\n')
      queries = lines
        .filter(line => line.trim().length > 0 && !line.includes('{') && !line.includes('}'))
        .map(line => line.replace(/^[^"]*"([^"]*)"[^"]*$/, '$1').trim())
        .filter(line => line.length > 0)
    }
    
    // Ensure we have at least some queries
    if (!Array.isArray(queries) || queries.length === 0) {
      console.warn(`Failed to extract queries, using fallback: ${content}`)
      queries = [query, `latest information about ${query}`, `${query} analysis`]
    }
    
    console.log(`Generated ${queries.length} queries:`, queries)
    return queries
  } catch (error) {
    console.error(`Error in generateQueries: ${error}`)
    // Fallback to simple queries based on the original question
    return [query, `latest information about ${query}`, `${query} analysis`]
  }
}

// Process a research iteration
async function processIteration(jobId: string, iteration: number, query: string, previousResults?: string, marketId?: string) {
  console.log(`Processing iteration ${iteration} for job ${jobId}`)
  
  try {
    await updateJobIteration(jobId, iteration)
    await appendProgress(jobId, `Starting iteration ${iteration}`)
    
    // Generate search queries
    await appendProgress(jobId, `Generating search queries for iteration ${iteration}`)
    const queries = await generateQueries(query, iteration, previousResults)
    await appendProgress(jobId, `Generated ${queries.length} queries for iteration ${iteration}`)
    
    // Perform web search and content gathering
    await appendProgress(jobId, `Running web search for iteration ${iteration}`)
    const searchResults = await performWebSearch(queries, query, marketId)
    await appendProgress(jobId, `Found ${searchResults.length} search results for iteration ${iteration}`)
    
    // Analyze content
    const contentToAnalyze = searchResults.map(r => r.content).join('\n\n')
    await appendProgress(jobId, `Analyzing content for iteration ${iteration} (${contentToAnalyze.length} characters)`)
    
    if (contentToAnalyze.length === 0) {
      await appendProgress(jobId, `Warning: No content to analyze for iteration ${iteration}`)
    }
    
    const { analysis, reasoning } = await analyzeContent(
      contentToAnalyze, 
      query, 
      previousResults,
      jobId,
      iteration
    )
    
    await appendProgress(jobId, `Completed analysis for iteration ${iteration}`)
    
    // Create iteration data
    const iterationData = {
      iteration,
      queries,
      results: searchResults,
      analysis: analysis || "Analysis not generated",
      reasoning: reasoning || ""
    }
    
    // Append iteration data to job
    await appendIteration(jobId, iterationData)
    
    // Check if we need to continue to next iteration
    const { data: jobData } = await createSupabaseClient()
      .from('research_jobs')
      .select("max_iterations")
      .eq('id', jobId)
    
    const maxIterations = jobData?.[0]?.max_iterations || 3
    
    if (iteration < maxIterations) {
      // Continue to next iteration
      await appendProgress(jobId, `Moving to iteration ${iteration + 1} of ${maxIterations}`)
      await processIteration(jobId, iteration + 1, query, analysis, marketId)
    } else {
      // Complete job
      await updateJobStatus(jobId, 'completed')
      await appendProgress(jobId, `Research job completed after ${iteration} iterations`)
    }
    
  } catch (error) {
    console.error(`Error processing iteration ${iteration} for job ${jobId}:`, error)
    await appendProgress(jobId, `Error in iteration ${iteration}: ${error.message}`)
    await updateJobStatus(jobId, 'failed', error.message)
  }
}

// Perform web search using queries
async function performWebSearch(queries: string[], originalQuery: string, marketId?: string) {
  let allResults: any[] = []
  
  try {
    for (const query of queries) {
      console.log(`Searching for: ${query}`)
      
      const searchBody = {
        query: query,
        marketId: marketId,
        limit: 3,
      }
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/web-scrape`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(searchBody)
      })
      
      if (!response.ok) {
        console.warn(`Search request failed: ${response.status}`)
        continue
      }
      
      const reader = response.body?.getReader()
      if (!reader) {
        console.warn('No response body reader')
        continue
      }
      
      const decoder = new TextDecoder()
      let buffer = ''
      let queryResults: any[] = []
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }
        
        buffer += decoder.decode(value, { stream: true })
        
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonData = JSON.parse(line.slice(5))
              
              if (jsonData.type === 'results' && Array.isArray(jsonData.data)) {
                queryResults = [...queryResults, ...jsonData.data]
              }
            } catch (e) {
              // Ignore parse errors for non-JSON lines
            }
          }
        }
      }
      
      allResults = [...allResults, ...queryResults]
      
      // Limit to prevent too much content
      if (allResults.length >= 10) {
        allResults = allResults.slice(0, 10)
        break
      }
    }
    
    // Deduplicate by URL
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.url, item])).values()
    )
    
    console.log(`Got ${uniqueResults.length} unique search results`)
    return uniqueResults
  } catch (error) {
    console.error('Error in web search:', error)
    return []
  }
}

// Analyze content function with streaming analysis support
async function analyzeContent(content: string, query: string, previousResults: string | undefined, jobId: string, iteration: number) {
  console.log(`Analyzing content for job ${jobId}, iteration ${iteration} (${content.length} chars)`)
  
  if (content.length === 0) {
    console.warn('No content to analyze')
    return { analysis: "No content was found to analyze.", reasoning: "Search results did not return any usable content." }
  }
  
  let analysisText = ''
  let reasoningText = ''
  let isAnalysisStreaming = true
  let isReasoningStreaming = false
  let currentSequence = 0
  let lastStreamActivity = Date.now()
  let streamCompletionDetected = false
  
  const streamTimeout = 60000 // 60 second timeout
  
  try {
    // Set initial iteration stream state
    await appendIteration(jobId, {
      iteration,
      queries: [],
      results: [],
      analysis: "",
      reasoning: "",
      isAnalysisStreaming,
      isReasoningStreaming
    })
    
    const systemPrompt = `You are a research assistant analyzing web content to answer a question.
Analyze the provided content and identify key information related to the question.
Provide a concise, factual analysis with clear conclusions when possible.
Back your analysis with specific information from the sources provided.`

    const contentForAnalysis = content.length > 120000 
      ? content.slice(0, 120000) + "... [content truncated due to length]" 
      : content

    const analyzeBody = {
      model: "deepseek/deepseek-r1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Question: ${query}

${previousResults ? `Previous analysis: ${previousResults}

` : ''}Content to analyze:
${contentForAnalysis}

First, provide a structured ANALYSIS answering the question based on the content. 
Then, under a "REASONING" heading, explain your thought process, highlighting important evidence, uncertainties, and how you reached your conclusions.` }
      ],
      temperature: 0.2,
      max_tokens: 4000,
      stream: true
    }
    
    console.log(`Making OpenRouter API request for analysis`)
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(analyzeBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Error analyzing content: ${response.status} ${error}`)
    }
    
    // Setup stream handling
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body reader')
    }
    
    const decoder = new TextDecoder()
    let buffer = ''
    let lastChunkReceivedTime = Date.now()
    
    // Set up a watchdog to detect stream stalls
    const streamWatchdog = setInterval(() => {
      const now = Date.now()
      const timeSinceLastChunk = now - lastChunkReceivedTime
      const timeSinceLastActivity = now - lastStreamActivity
      
      console.log(`Watchdog: ${timeSinceLastChunk}ms since last chunk, ${timeSinceLastActivity}ms since last activity, streaming status: analysis=${isAnalysisStreaming}, reasoning=${isReasoningStreaming}`)
      
      // If no activity for too long, force completion
      if (timeSinceLastActivity > streamTimeout && (isAnalysisStreaming || isReasoningStreaming)) {
        console.warn(`Stream timeout detected after ${timeSinceLastActivity}ms of inactivity! Forcing completion.`)
        
        // Force stream completion
        streamCompletionDetected = true
        isAnalysisStreaming = false
        isReasoningStreaming = false
        
        // Update iteration to show streaming has stopped
        updateIterationStreamingState(jobId, iteration, analysisText, reasoningText, false, false)
          .catch(e => console.error(`Error updating streaming state after timeout: ${e}`))
        
        clearInterval(streamWatchdog)
      }
    }, 5000) // Check every 5 seconds
    
    // Process the stream
    while (true) {
      // Break if we already detected completion via watchdog
      if (streamCompletionDetected) {
        console.log(`Breaking stream read loop: completion already detected`)
        break
      }
      
      const { done, value } = await reader.read()
      
      // Update last chunk received time
      lastChunkReceivedTime = Date.now()
      
      if (done) {
        console.log(`Stream complete - reader signaled done`)
        streamCompletionDetected = true
        isAnalysisStreaming = false
        isReasoningStreaming = false
        
        // Update iteration one final time
        await updateIterationStreamingState(jobId, iteration, analysisText, reasoningText, false, false)
        break
      }
      
      buffer += decoder.decode(value, { stream: true })
      
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''
      
      let hadActivity = false
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const content = line.slice(6)
            if (content === '[DONE]') {
              console.log(`Stream complete - [DONE] marker received`)
              streamCompletionDetected = true
              isAnalysisStreaming = false
              isReasoningStreaming = false
              
              // Final update to iteration
              await updateIterationStreamingState(jobId, iteration, analysisText, reasoningText, false, false)
              break
            }
            
            const parsed = JSON.parse(content)
            
            // Track all possible forms of content
            const delta = parsed.choices?.[0]?.delta || {}
            const messageContent = parsed.choices?.[0]?.message?.content || ''
            const deltaContent = delta.content || ''
            
            // Use any available content
            const chunkContent = messageContent || deltaContent || ''
            
            if (chunkContent) {
              hadActivity = true
              currentSequence++
              
              // Detect if we're in the reasoning section
              if (!isReasoningStreaming && chunkContent.includes('REASONING')) {
                isReasoningStreaming = true
                isAnalysisStreaming = false
                await updateIterationStreamingState(jobId, iteration, analysisText, reasoningText, false, true)
                console.log(`Switching to reasoning section at sequence ${currentSequence}`)
              }
              
              // Add content to appropriate section
              if (isReasoningStreaming) {
                reasoningText += chunkContent
              } else {
                analysisText += chunkContent
              }
              
              // Stream to database
              await createSupabaseClient().rpc('append_analysis_chunk', {
                job_id: jobId,
                iteration: iteration,
                chunk: chunkContent,
                seq: currentSequence
              })
              
              // Update the iteration periodically (every ~5 chunks to avoid too many updates)
              if (currentSequence % 5 === 0) {
                await updateIterationStreamingState(
                  jobId, 
                  iteration, 
                  analysisText, 
                  reasoningText,
                  isAnalysisStreaming,
                  isReasoningStreaming
                )
                console.log(`Updated iteration ${iteration} with ${analysisText.length} analysis chars and ${reasoningText.length} reasoning chars`)
              }
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines or partial chunks
            console.debug(`Error parsing stream data: ${e.message}`)
          }
        }
      }
      
      // Update activity timestamp if we had any content
      if (hadActivity) {
        lastStreamActivity = Date.now()
      }
    }
    
    // Clean up the watchdog
    clearInterval(streamWatchdog)
    
    // One final update to make sure all content is saved
    await updateIterationStreamingState(jobId, iteration, analysisText, reasoningText, false, false)
    
    // Extract final REASONING section if not already parsed
    if (reasoningText.length === 0 && analysisText.includes('REASONING')) {
      const parts = analysisText.split(/REASONING:?/i)
      if (parts.length > 1) {
        analysisText = parts[0].trim()
        reasoningText = parts[1].trim()
        
        // Update one more time with the split content
        await updateIterationStreamingState(jobId, iteration, analysisText, reasoningText, false, false)
      }
    }
    
    console.log(`Analysis complete for job ${jobId}, iteration ${iteration}`)
    console.log(`Analysis length: ${analysisText.length} chars, Reasoning length: ${reasoningText.length} chars`)
    
    return { 
      analysis: analysisText, 
      reasoning: reasoningText 
    }
  } catch (error) {
    console.error(`Error analyzing content:`, error)
    return { 
      analysis: `Error analyzing content: ${error.message}`, 
      reasoning: `Analysis failed due to an error: ${error.message}` 
    }
  }
}

// Helper to update iteration with streaming state
async function updateIterationStreamingState(
  jobId: string, 
  iteration: number, 
  analysis: string, 
  reasoning: string,
  isAnalysisStreaming: boolean,
  isReasoningStreaming: boolean
) {
  try {
    const iterationData = {
      iteration,
      queries: [], // Will be populated properly later
      results: [], // Will be populated properly later
      analysis: analysis || "",
      reasoning: reasoning || "",
      isAnalysisStreaming,
      isReasoningStreaming
    }
    
    // Update the iteration with current state
    await appendIteration(jobId, iterationData)
  } catch (error) {
    console.error(`Error updating iteration streaming state: ${error}`)
    throw error
  }
}
