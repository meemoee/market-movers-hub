import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.2.0'
import { corsHeaders } from '../_shared/cors.ts'
import { OpenAI } from 'https://esm.sh/openai@4.17.4'

interface JobRequest {
  marketId: string
  query: string
  maxIterations?: number
  focusText?: string
  notificationEmail?: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function generateQueryWithFocus(query: string, focusText: string) {
  if (!focusText) return query
  
  try {
    const openai = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    })
    
    const response = await openai.chat.completions.create({
      model: 'openai/gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a research query generator. Your job is to refocus a search query to emphasize a specific area of interest.`
        },
        {
          role: 'user',
          content: `I need to research this topic: "${query}"

I want to focus specifically on: "${focusText}"

Please rewrite the research query to emphasize this specific focus area. The response should be just the modified query text with no additional commentary.`
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    })

    const modifiedQuery = response.choices[0]?.message?.content?.trim() || query
    console.log("Modified query with focus:", modifiedQuery)
    return modifiedQuery
  } catch (error) {
    console.error("Error generating focused query:", error)
    return query
  }
}

async function generateFinalAnalysisWithStreaming(
  jobId: string,
  iterations: any[],
  query: string,
  marketId: string,
  focusText?: string
) {
  try {
    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: "Generating final analysis..."
    })

    // Extract analyses from iterations
    const analysesWithIteration = iterations.map(iter => ({
      iteration: iter.iteration,
      analysis: iter.analysis || '',
      queries: (iter.queries || []).join('\n'),
    })).filter(item => item.analysis.length > 0)

    // Sort by iteration number
    analysesWithIteration.sort((a, b) => a.iteration - b.iteration)
    
    const analyses = analysesWithIteration.map(item => 
      `ITERATION ${item.iteration} ANALYSIS:\n${item.analysis}`
    ).join('\n\n')
    
    const queriesUsed = analysesWithIteration.map(item => 
      `ITERATION ${item.iteration} QUERIES:\n${item.queries}`
    ).join('\n\n')

    // Determine all the search result sources
    const allSources: any[] = []
    
    iterations.forEach(iteration => {
      if (iteration.results && Array.isArray(iteration.results)) {
        iteration.results.forEach((result: any) => {
          if (result.url && result.title) {
            allSources.push({
              url: result.url,
              title: result.title || result.url,
              iteration: iteration.iteration
            })
          }
        })
      }
    })

    console.log(`Generating final analysis with ${analysesWithIteration.length} iterations of analysis and ${allSources.length} sources`)
    
    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: `Conducting final analysis of ${analysesWithIteration.length} research iterations...`
    })
    
    const systemPrompt = `You are a research analyst conducting a probabilistic analysis for a prediction market.
Your job is to analyze multiple iterations of research on a topic and provide a final comprehensive analysis.
The user is trying to determine the probability of a specific event happening.

You should focus on:
1. Synthesizing the key findings across all research iterations
2. Identifying consensus or disagreements between different research rounds
3. Evaluating the reliability of different sources
4. Providing a clear, objective analysis of the likelihood of the event occurring

If a specific focus area was requested, make sure your analysis prioritizes information related to that focus area.

At the end of your analysis, always provide a section titled "STRUCTURED INSIGHTS" that contains:
1. A JSON-formatted summary of key insights
2. A numerical probability estimate (as a percentage) of the event occurring
3. A confidence level in your estimate (low, medium, high)
4. At least 3 areas requiring further research

Format the STRUCTURED INSIGHTS section like this:
\`\`\`
{
  "keyInsights": ["insight1", "insight2", "insight3"],
  "probability": "XX%",
  "confidence": "medium",
  "areasForResearch": ["area1", "area2", "area3"]
}
\`\`\`

Do not include any markdown formatting symbols before this JSON code block.`

    let focusInstruction = ""
    if (focusText) {
      focusInstruction = `\nPRIORITY FOCUS AREA: ${focusText}\n\nEnsure your analysis prioritizes this specific focus area while still considering the broader question.`
    }
    
    const userPrompt = `MARKET QUESTION: ${query}${focusInstruction}

RESEARCH ITERATIONS:
${analyses}

QUERIES USED:
${queriesUsed}

SOURCES REFERENCED:
${allSources.map(s => `- [Iteration ${s.iteration}] ${s.title}: ${s.url}`).join('\n')}

Using the above research iterations, please provide a comprehensive final analysis on the market question.
Conclude with the STRUCTURED INSIGHTS section as specified.`

    const openai = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    })
    
    console.log("Starting final analysis stream")
    const stream = await openai.chat.completions.create({
      model: 'openai/gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      stream: true,
    })
    
    let fullAnalysis = ""
    let sequence = 0

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullAnalysis += content
        
        // Write chunk to analysis_stream table with iteration=0 (indicating final analysis)
        await supabase.from('analysis_stream')
          .insert({
            job_id: jobId,
            iteration: 0, // Use iteration 0 for final analysis
            chunk: content,
            sequence: sequence++
          })
      }
    }

    console.log("Final analysis complete, extracting structured insights")

    // Extract structured insights
    let structuredInsights = null
    const structuredMatch = fullAnalysis.match(/```\s*\n({[\s\S]*?})\s*\n```/) || 
                            fullAnalysis.match(/STRUCTURED INSIGHTS\s*\n({[\s\S]*?})/)
    
    if (structuredMatch && structuredMatch[1]) {
      try {
        structuredInsights = JSON.parse(structuredMatch[1])
        console.log("Successfully extracted structured insights:", structuredInsights)
      } catch (err) {
        console.error("Failed to parse structured insights:", err)
        console.log("Raw match:", structuredMatch[1])
      }
    } else {
      console.log("No structured insights found using regex pattern")
    }

    // Update research job with final analysis and results
    await supabase
      .from('research_jobs')
      .update({
        results: {
          analysis: fullAnalysis,
          structuredInsights: structuredInsights,
          data: iterations.flatMap(iter => (iter.results || []))
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: "Final analysis complete"
    })

    return { success: true, analysis: fullAnalysis, structuredInsights }
  } catch (error) {
    console.error("Error in final analysis:", error)
    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: `Error generating final analysis: ${error.message || 'Unknown error'}`
    })
    return { success: false, error: error.message }
  }
}

async function processResearchJob(jobId: string, query: string, marketId: string, maxIterations: number, focusText?: string) {
  try {
    // Update job status to processing
    await supabase.rpc("update_research_job_status", {
      job_id: jobId,
      new_status: 'processing'
    })

    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: "Job processing started"
    })

    // Get market details if available
    const { data: marketData } = await supabase
      .from('markets')
      .select('question, description, outcomes')
      .eq('id', marketId)
      .single()
    
    if (marketData) {
      console.log("Found market data:", marketData.question)
      
      // Update market data in job
      await supabase
        .from('research_jobs')
        .update({ market_data: marketData })
        .eq('id', jobId)
      
      // Use market question as query if it exists and query is empty
      if (marketData.question && (!query || query.trim() === '')) {
        query = marketData.question
      }
    }

    // Add focus text to the research query if provided
    let effectiveQuery = query
    if (focusText) {
      await supabase.rpc("append_progress_log", {
        job_id: jobId,
        log_message: `Focusing research on: ${focusText}`
      })
      effectiveQuery = await generateQueryWithFocus(query, focusText)
    }

    // Start the job with a query generation
    const queryGenResult = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        topic: effectiveQuery,
        iteration: 1
      })
    })
    
    if (!queryGenResult.success) {
      throw new Error(`Failed to generate initial queries: ${queryGenResult.error || 'Unknown error'}`)
    }

    // Initialize iterations array with first iteration
    const iterations = [{
      iteration: 1,
      queries: queryGenResult.queries || [],
      results: [],
      analysis: ''
    }]

    // Update job with iterations
    await supabase
      .from('research_jobs')
      .update({
        iterations: iterations,
        current_iteration: 1
      })
      .eq('id', jobId)

    await supabase.rpc("append_progress_log", {
      job_id: jobId,
      log_message: `Starting research iteration 1/${maxIterations}...`
    })

    // Perform iterations
    for (let i = 1; i <= maxIterations; i++) {
      // Skip if we're beyond the current iteration (shouldn't happen)
      if (i > iterations.length) continue
      
      const currentIteration = iterations[i-1]
      const queries = currentIteration.queries || []
      
      if (queries.length === 0) {
        console.log(`No queries for iteration ${i}, skipping`)
        continue
      }

      // For each query, perform web research
      const allResults = []
      for (let j = 0; j < queries.length; j++) {
        const query = queries[j]
        
        // Log progress
        await supabase.rpc("append_progress_log", {
          job_id: jobId,
          log_message: `Running query ${j+1}/${queries.length}: "${query}" (iteration ${i})`
        })
        
        // Perform web research for this query
        const researchResult = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/web-research`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({ query })
        })
        
        if (researchResult.error) {
          console.error(`Error in web research for query "${query}":`, researchResult.error)
          await supabase.rpc("append_progress_log", {
            job_id: jobId,
            log_message: `Error in web research for query "${query}": ${researchResult.error}`
          })
          continue
        }
        
        if (researchResult.results && Array.isArray(researchResult.results)) {
          // Add results from this query
          allResults.push(...researchResult.results)
          
          // Log progress
          await supabase.rpc("append_progress_log", {
            job_id: jobId,
            log_message: `Found ${researchResult.results.length} results for query: "${query}"`
          })
        }
      }

      // Update iteration with results
      currentIteration.results = allResults
      iterations[i-1] = currentIteration
      
      // Update job with new results
      await supabase
        .from('research_jobs')
        .update({
          iterations
        })
        .eq('id', jobId)
      
      // Analyze results if we have any
      if (allResults.length > 0) {
        await supabase.rpc("append_progress_log", {
          job_id: jobId,
          log_message: `Analyzing ${allResults.length} research results for iteration ${i}...`
        })
        
        // Extract site contents for analysis
        const sitesForAnalysis = allResults.map((r: any) => ({
          url: r.url,
          content: r.content,
          title: r.title || r.url
        }))
        
        // Get web content analysis
        const analysisResult = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/analyze-web-content`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({
            topic: effectiveQuery,
            sites: sitesForAnalysis,
            iteration: i,
            maxIterations,
            jobId
          })
        })

        if (analysisResult.error) {
          console.error(`Error in analysis:`, analysisResult.error)
          await supabase.rpc("append_progress_log", {
            job_id: jobId,
            log_message: `Error in analysis: ${analysisResult.error}`
          })
        } else if (analysisResult.analysis) {
          // Update iteration with analysis
          currentIteration.analysis = analysisResult.analysis
          iterations[i-1] = currentIteration
          
          // Update job with analysis
          await supabase
            .from('research_jobs')
            .update({
              iterations
            })
            .eq('id', jobId)
        }
      } else {
        await supabase.rpc("append_progress_log", {
          job_id: jobId,
          log_message: `No results found for iteration ${i}`
        })
      }

      // If this isn't the last iteration, generate queries for next iteration
      if (i < maxIterations) {
        await supabase.rpc("append_progress_log", {
          job_id: jobId,
          log_message: `Preparing for iteration ${i+1}/${maxIterations}...`
        })
        
        const nextQueryInput = {
          topic: effectiveQuery, 
          iteration: i+1,
          previousIterations: iterations.slice(0, i).map(iter => ({
            queries: iter.queries,
            analysis: iter.analysis
          }))
        }
        
        const nextQueriesResult = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/generate-queries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify(nextQueryInput)
        })
        
        if (nextQueriesResult.error) {
          console.error(`Error generating queries for iteration ${i+1}:`, nextQueriesResult.error)
          await supabase.rpc("append_progress_log", {
            job_id: jobId,
            log_message: `Error generating queries for iteration ${i+1}: ${nextQueriesResult.error}`
          })
          break
        }
        
        if (nextQueriesResult.queries && Array.isArray(nextQueriesResult.queries)) {
          // Create next iteration with new queries
          iterations.push({
            iteration: i+1,
            queries: nextQueriesResult.queries,
            results: [],
            analysis: ''
          })
          
          // Update job with new iteration
          await supabase
            .from('research_jobs')
            .update({
              iterations,
              current_iteration: i+1
            })
            .eq('id', jobId)
            
          await supabase.rpc("append_progress_log", {
            job_id: jobId,
            log_message: `Starting research iteration ${i+1}/${maxIterations}...`
          })
        }
      }
    }
    
    // Generate final analysis
    const analysisResult = await generateFinalAnalysisWithStreaming(
      jobId,
      iterations,
      effectiveQuery,
      marketId,
      focusText
    )
    
    if (!analysisResult.success) {
      throw new Error(`Failed to generate final analysis: ${analysisResult.error || 'Unknown error'}`)
    }
    
    // Update job status to completed
    await supabase.rpc("update_research_job_status", {
      job_id: jobId,
      new_status: 'completed'
    })
    
    // Send notification email if requested
    const { data: jobData } = await supabase
      .from('research_jobs')
      .select('notification_email')
      .eq('id', jobId)
      .single()
    
    if (jobData?.notification_email) {
      try {
        // Send notification via edge function
        await fetch(`${SUPABASE_URL}/functions/v1/send-research-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({ 
            jobId, 
            email: jobData.notification_email,
            marketId,
            focusText
          })
        })
        
        // Update notification sent status
        await supabase
          .from('research_jobs')
          .update({ notification_sent: true })
          .eq('id', jobId)
        
        console.log(`Notification email sent to ${jobData.notification_email}`)
      } catch (err) {
        console.error("Error sending notification:", err)
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Error processing research job:", error)
    
    // Update job status to failed
    await supabase.rpc("update_research_job_status", {
      job_id: jobId,
      new_status: 'failed',
      error_msg: error.message || "Unknown error"
    })
    
    return { success: false, error: error.message }
  }
}

// Fetch with retry functionality
async function fetchWithRetry(url: string, options: any, maxRetries = 3, delay = 1000) {
  let lastError = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`)
      }
      return await response.json()
    } catch (error) {
      console.error(`Attempt ${attempt + 1}/${maxRetries} failed:`, error)
      lastError = error
      
      if (attempt < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, attempt)
        console.log(`Retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }
  
  throw lastError || new Error(`Failed after ${maxRetries} attempts`)
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json() as JobRequest
    
    if (!marketId) {
      throw new Error("Market ID is required")
    }
    
    // Create a new research job
    const { data: jobData, error: jobError } = await supabase
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query || '',
        status: 'queued',
        max_iterations: maxIterations,
        progress_log: ['Job created, queued for processing'],
        notification_email: notificationEmail,
        focus_text: focusText
      })
      .select()
      .single()
    
    if (jobError) {
      throw jobError
    }
    
    if (!jobData || !jobData.id) {
      throw new Error("Failed to create research job")
    }
    
    const jobId = jobData.id
    
    // Process the job asynchronously
    EdgeRuntime.waitUntil(
      processResearchJob(jobId, query || '', marketId, maxIterations, focusText)
    )
    
    return new Response(
      JSON.stringify({ success: true, jobId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
