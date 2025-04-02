import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

// Configure CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Define types for the research job
interface ResearchJob {
  id: string
  query: string
  market_id: string
  market_data?: any
  user_id?: string
  notification_email?: string
  focus_text?: string
  max_iterations: number
}

interface WebContent {
  content: string
  url: string
  title?: string
  snippet?: string
}

// Function to fetch web content
async function fetchWebContent(query: string): Promise<WebContent[]> {
  try {
    console.log(`Fetching web content for query: ${query}`)
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/web-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ query }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error fetching web content: ${response.status} ${errorText}`)
      throw new Error(`Error fetching web content: ${response.status} ${errorText}`)
    }
    
    const data = await response.json()
    console.log(`Received ${data.results?.length || 0} web content results`)
    return data.results || []
  } catch (error) {
    console.error('Error in fetchWebContent:', error)
    throw error
  }
}

// Function to analyze web content
async function analyzeWebContent(content: string, query: string, focusText?: string, marketQuestion?: string): Promise<string> {
  try {
    console.log(`Analyzing web content for query: ${query}${focusText ? `, with focus on: ${focusText}` : ''}`)
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-web-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ 
        content, 
        query,
        focusText,
        marketQuestion
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error analyzing web content: ${response.status} ${errorText}`)
      throw new Error(`Error analyzing web content: ${response.status} ${errorText}`)
    }
    
    const result = await response.json()
    console.log(`Received analysis result of length: ${result.analysis?.length || 0}`)
    return result.analysis || ''
  } catch (error) {
    console.error('Error in analyzeWebContent:', error)
    throw error
  }
}

// Function to generate improved search queries
async function generateImprovedQueries(
  originalQuery: string, 
  webContent: string, 
  analysis: string, 
  focusText?: string,
  previousQueries?: string[]
): Promise<string[]> {
  try {
    console.log(`Generating improved queries based on initial query: ${originalQuery}${focusText ? `, with focus on: ${focusText}` : ''}`)
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ 
        originalQuery, 
        webContent, 
        analysis, 
        focusText,
        previousQueries
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error generating improved queries: ${response.status} ${errorText}`)
      throw new Error(`Error generating improved queries: ${response.status} ${errorText}`)
    }
    
    const result = await response.json()
    console.log(`Generated ${result.queries?.length || 0} improved queries`)
    return result.queries || []
  } catch (error) {
    console.error('Error in generateImprovedQueries:', error)
    throw error
  }
}

// Function to extract research insights
async function extractResearchInsights(
  webContent: string,
  previousAnalyses: string[],
  query: string,
  marketId?: string,
  marketQuestion?: string,
  previousIterations?: any[],
  queries?: string[],
  areasForResearch?: string[],
  focusText?: string,
  marketPrice?: number,
  relatedMarkets?: any[]
): Promise<any> {
  try {
    console.log(`Extracting research insights for query: ${query}${marketId ? `, market ID: ${marketId}` : ''}`)
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ 
        webContent, 
        previousAnalyses,
        marketId, 
        marketQuestion,
        previousIterations,
        queries,
        areasForResearch,
        focusText,
        marketPrice,
        relatedMarkets
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error extracting research insights: ${response.status} ${errorText}`)
      throw new Error(`Error extracting research insights: ${response.status} ${errorText}`)
    }
    
    const result = await response.json()
    console.log(`Received insights with probability: ${result?.choices?.[0]?.message?.content?.probability || 'unknown'}`)
    return result.choices[0].message.content
  } catch (error) {
    console.error('Error in extractResearchInsights:', error)
    throw error
  }
}

// Function to generate and stream the final analysis
async function generateFinalAnalysisWithStreaming(
  iterations: any[],
  query: string,
  focusText?: string,
  marketQuestion?: string
): Promise<string> {
  try {
    console.log(`Generating final analysis for ${iterations.length} iterations of query: ${query}`)
    
    // Extract content from iterations
    const allWebContent = iterations.flatMap(iteration => {
      return iteration.webContent || []
    })
    .map((content: any) => content.content || '')
    .join('\n\n')
    
    const allAnalyses = iterations.map(iteration => iteration.analysis || '').join('\n\n')
    
    // Use the analyze-web-content function to generate the final analysis
    return await analyzeWebContent(
      allWebContent,
      query,
      focusText,
      marketQuestion
    )
  } catch (error) {
    console.error('Error in generateFinalAnalysisWithStreaming:', error)
    throw error
  }
}

// Function to send a notification
async function sendNotification(
  email: string, 
  jobId: string,
  marketId: string,
  structuredInsights: any
): Promise<void> {
  try {
    console.log(`Sending notification to ${email} for job ${jobId}`)
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-research-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ 
        email,
        jobId,
        marketId,
        probability: structuredInsights.probability,
        areasForResearch: structuredInsights.areasForResearch || []
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error sending notification: ${response.status} ${errorText}`)
      throw new Error(`Error sending notification: ${response.status} ${errorText}`)
    }
    
    console.log(`Notification sent successfully to ${email}`)
  } catch (error) {
    console.error('Error in sendNotification:', error)
    // We don't want to fail the whole job if notification fails
    console.log('Continuing despite notification error')
  }
}

// Function to update job progress
async function updateJobProgress(
  jobId: string, 
  status: string, 
  progressLog: any[],
  iterations?: any[],
  results?: any,
  errorMessage?: string,
  currentIteration?: number,
  completedAt?: string
): Promise<void> {
  try {
    const updates: any = {
      status,
      progress_log: progressLog,
    }
    
    if (iterations !== undefined) {
      updates.iterations = iterations
    }
    
    if (results !== undefined) {
      updates.results = results
    }
    
    if (errorMessage !== undefined) {
      updates.error_message = errorMessage
    }
    
    if (currentIteration !== undefined) {
      updates.current_iteration = currentIteration
    }
    
    if (completedAt !== undefined) {
      updates.completed_at = completedAt
    }
    
    console.log(`Updating job ${jobId} status to ${status}`)
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/research_jobs`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_KEY')}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        ...updates,
        id: jobId,
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error updating job progress: ${response.status} ${errorText}`)
      throw new Error(`Error updating job progress: ${response.status} ${errorText}`)
    }
    
    console.log(`Job ${jobId} updated successfully to status ${status}`)
  } catch (error) {
    console.error('Error in updateJobProgress:', error)
    throw error
  }
}

// Main function to perform web research
async function performWebResearch(job: ResearchJob): Promise<void> {
  console.log(`Starting research job ${job.id} for query: ${job.query}`)
  
  const startTime = new Date()
  
  try {
    // Mark job as started
    await updateJobProgress(
      job.id, 
      'in_progress',
      [{ time: new Date().toISOString(), message: 'Job started' }],
      [],
      undefined,
      undefined,
      0,
      undefined
    )
    
    // Retrieve market data if applicable
    let marketQuestion: string | undefined
    let marketPrice: number | undefined
    let relatedMarkets: any[] = []
    
    if (job.market_data) {
      marketQuestion = job.market_data.question
      marketPrice = job.market_data.probability
      relatedMarkets = job.market_data.relatedMarkets || []
    }
    
    // Initialize iterations array and progress log
    let iterations: any[] = []
    let progressLog = [{ time: new Date().toISOString(), message: 'Job started' }]
    let allQueries = [job.query]
    let allAreasForResearch: string[] = []
    
    // Perform the specified number of iterations
    for (let i = 0; i < job.max_iterations; i++) {
      const iterationStartTime = new Date()
      const iterationNumber = i + 1
      console.log(`Starting iteration ${iterationNumber} of ${job.max_iterations}`)
      
      progressLog.push({ 
        time: new Date().toISOString(), 
        message: `Starting iteration ${iterationNumber}: searching for "${allQueries[i]}"` 
      })
      
      await updateJobProgress(
        job.id, 
        'in_progress',
        progressLog,
        iterations,
        undefined,
        undefined,
        iterationNumber,
        undefined
      )
      
      // Step 1: Fetch web content
      const webContent = await fetchWebContent(allQueries[i])
      
      if (!webContent || webContent.length === 0) {
        progressLog.push({ 
          time: new Date().toISOString(), 
          message: `Iteration ${iterationNumber}: No web content found for query "${allQueries[i]}"` 
        })
        continue
      }
      
      progressLog.push({ 
        time: new Date().toISOString(), 
        message: `Iteration ${iterationNumber}: Retrieved ${webContent.length} web pages for analysis` 
      })
      
      await updateJobProgress(
        job.id, 
        'in_progress',
        progressLog,
        iterations,
        undefined,
        undefined,
        iterationNumber,
        undefined
      )
      
      // Step 2: Analyze the web content
      const combinedContent = webContent.map(item => `SOURCE: ${item.url}\nTITLE: ${item.title || 'No title'}\n\n${item.content}`).join('\n\n---\n\n')
      
      const analysis = await analyzeWebContent(
        combinedContent, 
        allQueries[i], 
        job.focus_text,
        marketQuestion
      )
      
      progressLog.push({ 
        time: new Date().toISOString(), 
        message: `Iteration ${iterationNumber}: Completed analysis of web content` 
      })
      
      // Store the iteration results
      const iteration = {
        query: allQueries[i],
        webContent,
        analysis,
        timestamp: new Date().toISOString()
      }
      
      iterations.push(iteration)
      
      await updateJobProgress(
        job.id, 
        'in_progress',
        progressLog,
        iterations,
        undefined,
        undefined,
        iterationNumber,
        undefined
      )
      
      // Step 3: Generate improved queries for the next iteration
      if (i < job.max_iterations - 1) {
        const previousAnalyses = iterations.map(iter => iter.analysis)
        
        const improvedQueries = await generateImprovedQueries(
          job.query, 
          combinedContent,
          analysis,
          job.focus_text,
          allQueries
        )
        
        if (improvedQueries && improvedQueries.length > 0) {
          allQueries.push(improvedQueries[0])
          
          progressLog.push({ 
            time: new Date().toISOString(), 
            message: `Iteration ${iterationNumber}: Generated improved query for next iteration: "${improvedQueries[0]}"` 
          })
        } else {
          // If no improved queries, use the original query again
          allQueries.push(job.query)
          
          progressLog.push({ 
            time: new Date().toISOString(), 
            message: `Iteration ${iterationNumber}: Could not generate improved queries, using original query for next iteration` 
          })
        }
      }
      
      const iterationEndTime = new Date()
      const iterationDuration = (iterationEndTime.getTime() - iterationStartTime.getTime()) / 1000
      
      progressLog.push({ 
        time: new Date().toISOString(), 
        message: `Completed iteration ${iterationNumber} in ${iterationDuration.toFixed(2)} seconds` 
      })
      
      await updateJobProgress(
        job.id, 
        'in_progress',
        progressLog,
        iterations,
        undefined,
        undefined,
        iterationNumber,
        undefined
      )
    }
    
    // Log that we're skipping the final analysis step
    progressLog.push({ 
      time: new Date().toISOString(), 
      message: `Skipping final analysis generation and proceeding directly to structured insights extraction` 
    })
    
    await updateJobProgress(
      job.id, 
      'in_progress',
      progressLog,
      iterations,
      undefined,
      undefined,
      job.max_iterations,
      undefined
    )
    
    // Step 5: Extract structured insights from the research
    progressLog.push({ 
      time: new Date().toISOString(), 
      message: 'Extracting structured insights from research' 
    })
    
    await updateJobProgress(
      job.id, 
      'in_progress',
      progressLog,
      iterations,
      undefined,
      undefined,
      job.max_iterations,
      undefined
    )
    
    // Prepare input for insights extraction
    const allWebContent = iterations.flatMap(iteration => {
      return iteration.webContent || []
    })
    .map((content: any) => content.content || '')
    .join('\n\n')
    
    const previousAnalyses = iterations.map(iteration => iteration.analysis || '')
    
    // Create payload for insights extraction
    const insightsPayload = {
      webContent: allWebContent,
      previousAnalyses,
      marketId: job.market_id,
      marketQuestion,
      previousIterations: iterations,
      queries: allQueries,
      areasForResearch: allAreasForResearch,
      focusText: job.focus_text,
      marketPrice,
      relatedMarkets
    }
    
    // Extract structured insights
    const structuredInsights = await extractResearchInsights(
      allWebContent,
      previousAnalyses,
      job.query,
      job.market_id,
      marketQuestion,
      iterations,
      allQueries,
      allAreasForResearch,
      job.focus_text,
      marketPrice,
      relatedMarkets
    )
    
    progressLog.push({ 
      time: new Date().toISOString(), 
      message: `Extracted structured insights with probability: ${structuredInsights.probability || 'unknown'}` 
    })
    
    // Create final results object
    const finalResults = {
      data: {
        webContent: iterations.flatMap(i => i.webContent || []),
        iterations,
        queries: allQueries
      },
      structuredInsights
    }
    
    // Mark job as completed
    const endTime = new Date()
    const duration = (endTime.getTime() - startTime.getTime()) / 1000
    
    progressLog.push({ 
      time: endTime.toISOString(), 
      message: `Job completed successfully in ${duration.toFixed(2)} seconds` 
    })
    
    await updateJobProgress(
      job.id, 
      'completed',
      progressLog,
      iterations,
      finalResults,
      undefined,
      job.max_iterations,
      endTime.toISOString()
    )
    
    // Send notification if email is provided
    if (job.notification_email) {
      await sendNotification(
        job.notification_email,
        job.id,
        job.market_id,
        structuredInsights
      )
    }
    
    console.log(`Research job ${job.id} completed successfully in ${duration.toFixed(2)} seconds`)
  } catch (error) {
    console.error(`Error in research job ${job.id}:`, error)
    
    // Mark job as failed
    const errorMessage = error.message || 'Unknown error'
    const progressLog = [
      { time: startTime.toISOString(), message: 'Job started' },
      { time: new Date().toISOString(), message: `Job failed: ${errorMessage}` }
    ]
    
    await updateJobProgress(
      job.id,
      'failed',
      progressLog,
      [],
      undefined,
      errorMessage,
      0,
      new Date().toISOString()
    )
  }
}

// Main handler for the edge function
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    const { job } = await req.json()
    
    if (!job || !job.id || !job.query || !job.market_id) {
      throw new Error('Invalid job data: missing required fields')
    }
    
    // Process the research job in the background
    const processPromise = performWebResearch(job)
    
    // Return immediately with a success response
    const response = {
      message: 'Research job started successfully',
      jobId: job.id
    }
    
    // Use waitUntil to continue processing after response is sent
    // Deno Deploy will keep the instance alive until this promise resolves
    if (typeof EdgeRuntime !== 'undefined') {
      // @ts-ignore - EdgeRuntime is a global in Deno Deploy
      EdgeRuntime.waitUntil(processPromise)
    } else {
      // For local development, we await the promise
      await processPromise
    }
    
    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error in create-research-job function:', error)
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
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
