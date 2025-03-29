import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.29.0"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

// Initialize Supabase client with env variables
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY') || ''

const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

// Set CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Main server function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse request body
    const requestData = await req.json()
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = requestData

    console.log(`Request body: ${JSON.stringify(requestData, null, 2)}`)

    if (!marketId) {
      throw new Error('Missing required parameter: marketId')
    }

    console.log(`Starting research job for market ID: ${marketId}`)

    // Retrieve market data from database
    console.log('Retrieving market data')
    const { data: marketData, error: marketError } = await supabaseClient
      .from('markets')
      .select('clobtokenids, question')
      .eq('id', marketId)
      .single()

    if (marketError) {
      console.error('Error fetching market data:', marketError)
      throw new Error(`Error fetching market data: ${marketError.message}`)
    }

    // Insert new job into research_jobs table
    const { data: jobData, error: jobError } = await supabaseClient
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        progress_log: ['Job created, waiting to start...'],
        max_iterations: maxIterations,
        current_iteration: 0,
        iterations: [],
        focus_text: focusText,
        notification_email: notificationEmail
      })
      .select()
      .single()

    if (jobError) {
      console.error('Error creating research job:', jobError)
      throw new Error(`Error creating research job: ${jobError.message}`)
    }

    const jobId = jobData.id

    console.log(`Created research job with ID: ${jobId}`)

    // Start the research process as a background task
    const runResearchProcess = async () => {
      try {
        console.log(`Starting research process for job ${jobId}`)
        
        // Update job status to processing
        await supabaseClient
          .from('research_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
            progress_log: ['Starting research process...']
          })
          .eq('id', jobId)

        // Process the specified number of iterations
        let context = ''
        const iterations = []
        
        for (let i = 0; i < maxIterations; i++) {
          console.log(`Starting iteration ${i + 1} of ${maxIterations}`)
          
          const iteration = await processResearchIteration(
            i + 1,
            maxIterations,
            jobId,
            marketId,
            query,
            context,
            focusText
          )
          
          iterations.push(iteration)
          context += `\n\nIteration ${i + 1} results:\n${iteration.insights || ''}\n${iteration.sources?.map(s => s.content || '').join('\n') || ''}`
          
          console.log(`Completed iteration ${i + 1}`)
          
          // Update job with the new iteration
          await supabaseClient
            .from('research_jobs')
            .update({
              current_iteration: i + 1,
              iterations: iterations,
              progress_log: [...(jobData.progress_log || []), `Completed iteration ${i + 1} of ${maxIterations}`]
            })
            .eq('id', jobId)
        }
        
        // Generate final analysis
        console.log('Generating final analysis')
        
        await supabaseClient
          .from('research_jobs')
          .update({
            progress_log: [...(jobData.progress_log || []), 'Generating final analysis...']
          })
          .eq('id', jobId)
        
        const finalResults = await generateFinalAnalysis(iterations, query, focusText)
        
        // Complete the job
        console.log('Research job completed successfully')
        
        await supabaseClient
          .from('research_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            results: finalResults,
            progress_log: [...(jobData.progress_log || []), 'Research job completed successfully']
          })
          .eq('id', jobId)
          
        // If notification email is provided, trigger email sending
        if (notificationEmail) {
          try {
            console.log(`Sending notification email to ${notificationEmail}`)
            
            await supabaseClient.functions.invoke('send-research-notification', {
              body: {
                jobId,
                email: notificationEmail,
                marketId,
                query
              }
            })
            
            await supabaseClient
              .from('research_jobs')
              .update({
                notification_sent: true,
                progress_log: [...(jobData.progress_log || []), `Notification email sent to ${notificationEmail}`]
              })
              .eq('id', jobId)
              
            console.log('Notification email sent successfully')
          } catch (emailError) {
            console.error('Error sending notification email:', emailError)
            
            await supabaseClient
              .from('research_jobs')
              .update({
                progress_log: [...(jobData.progress_log || []), `Error sending notification email: ${emailError.message}`]
              })
              .eq('id', jobId)
          }
        }
      } catch (error) {
        console.error(`Error in research process for job ${jobId}:`, error)
        
        // Update job as failed
        await supabaseClient
          .from('research_jobs')
          .update({
            status: 'failed',
            error_message: error.message,
            progress_log: [...(jobData.progress_log || []), `Error: ${error.message}`]
          })
          .eq('id', jobId)
      }
    }

    // Start the research process without awaiting its completion
    runResearchProcess()

    // Return a success response immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Research job created and started in the background',
        jobId
      }),
      { 
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Error in create-research-job:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
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

// Function to process a single research iteration
async function processResearchIteration(
  iteration: number,
  maxIterations: number,
  jobId: string,
  marketId: string,
  query: string,
  previousContext: string,
  focusText?: string
) {
  console.log(`Processing iteration ${iteration} for job ${jobId}`)
  
  // Update progress log
  await supabaseClient
    .from('research_jobs')
    .update({
      progress_log: supabaseClient.rpc('append_to_progress_log', {
        job_id: jobId,
        new_log_entry: `Starting research iteration ${iteration} of ${maxIterations}...`
      })
    })
    .eq('id', jobId)
  
  try {
    // Generate search queries
    console.log('Generating search queries')
    
    await supabaseClient
      .from('research_jobs')
      .update({
        progress_log: supabaseClient.rpc('append_to_progress_log', {
          job_id: jobId,
          new_log_entry: 'Generating search queries...'
        })
      })
      .eq('id', jobId)
    
    const queries = await generateQueries(query, previousContext, iteration, focusText)
    
    // Log the generated queries
    console.log(`Generated ${queries.length} queries`)
    
    await supabaseClient
      .from('research_jobs')
      .update({
        progress_log: supabaseClient.rpc('append_to_progress_log', {
          job_id: jobId,
          new_log_entry: `Generated ${queries.length} search queries`
        })
      })
      .eq('id', jobId)
    
    // Search and scrape for each query
    const allResults = []
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      console.log(`Processing query ${i + 1}/${queries.length}: "${query}"`)
      
      await supabaseClient
        .from('research_jobs')
        .update({
          progress_log: supabaseClient.rpc('append_to_progress_log', {
            job_id: jobId,
            new_log_entry: `Searching for: "${query}"`
          })
        })
        .eq('id', jobId)
      
      // Get search results
      const searchResults = await performSearch(query)
      
      // Update progress
      await supabaseClient
        .from('research_jobs')
        .update({
          progress_log: supabaseClient.rpc('append_to_progress_log', {
            job_id: jobId,
            new_log_entry: `Found ${searchResults.length} results for query: "${query}"`
          })
        })
        .eq('id', jobId)
      
      // Scrape content from search results
      const scrapedResults = await scrapeContent(searchResults)
      allResults.push(...scrapedResults)
      
      // Update progress
      await supabaseClient
        .from('research_jobs')
        .update({
          progress_log: supabaseClient.rpc('append_to_progress_log', {
            job_id: jobId,
            new_log_entry: `Scraped ${scrapedResults.length} pages for query: "${query}"`
          })
        })
        .eq('id', jobId)
    }
    
    // Sort and filter results, keeping only top unique results
    const uniqueResults = filterUniqueResults(allResults)
    
    // Generate analysis based on search results
    console.log('Generating analysis from search results')
    
    await supabaseClient
      .from('research_jobs')
      .update({
        progress_log: supabaseClient.rpc('append_to_progress_log', {
          job_id: jobId,
          new_log_entry: `Analyzing ${uniqueResults.length} unique results...`
        })
      })
      .eq('id', jobId)
    
    const analysis = await generateAnalysis(uniqueResults, query, previousContext, focusText)
    
    // Create iteration result
    const iterationResult = {
      iteration,
      query: query,
      focus: focusText,
      sources: uniqueResults.map(result => ({
        url: result.url,
        title: result.title,
        content: result.content.substring(0, 1000) // Truncate content to save space
      })),
      insights: analysis,
      completed_at: new Date().toISOString()
    }
    
    console.log(`Completed iteration ${iteration}`)
    
    return iterationResult
  } catch (error) {
    console.error(`Error in iteration ${iteration}:`, error)
    
    await supabaseClient
      .from('research_jobs')
      .update({
        progress_log: supabaseClient.rpc('append_to_progress_log', {
          job_id: jobId,
          new_log_entry: `Error in iteration ${iteration}: ${error.message}`
        })
      })
      .eq('id', jobId)
    
    // Return a minimal result despite the error
    return {
      iteration,
      query: query,
      focus: focusText,
      sources: [],
      insights: `Error occurred: ${error.message}`,
      completed_at: new Date().toISOString(),
      error: error.message
    }
  }
}

// Function to generate search queries based on the market question and context
async function generateQueries(
  marketQuestion: string,
  previousContext: string,
  iteration: number,
  focusText?: string
): Promise<string[]> {
  console.log('Calling generate-queries function')
  
  const response = await supabaseClient.functions.invoke('generate-queries', {
    body: {
      marketQuestion,
      previousContext,
      iteration,
      focusText
    }
  })
  
  if (response.error) {
    console.error('Error generating queries:', response.error)
    throw new Error(`Error generating queries: ${response.error.message || JSON.stringify(response.error)}`)
  }
  
  return response.data.queries || []
}

// Function to perform search using Brave Search
async function performSearch(query: string): Promise<any[]> {
  console.log(`Searching for: "${query}"`)
  
  const response = await supabaseClient.functions.invoke('brave-search', {
    body: { query, limit: 5 }
  })
  
  if (response.error) {
    console.error('Error in brave-search:', response.error)
    throw new Error(`Error in brave-search: ${response.error.message || JSON.stringify(response.error)}`)
  }
  
  return response.data.results || []
}

// Function to scrape content from search results
async function scrapeContent(searchResults: any[]): Promise<any[]> {
  console.log(`Scraping ${searchResults.length} search results`)
  
  const scrapedResults = []
  
  for (const result of searchResults) {
    try {
      console.log(`Scraping: ${result.url}`)
      
      const response = await supabaseClient.functions.invoke('web-scrape', {
        body: { url: result.url }
      })
      
      if (response.error) {
        console.error(`Error scraping ${result.url}:`, response.error)
        continue
      }
      
      if (response.data && response.data.content) {
        scrapedResults.push({
          url: result.url,
          title: result.title || response.data.title || 'No title',
          content: response.data.content
        })
      }
    } catch (error) {
      console.error(`Error scraping ${result.url}:`, error)
      continue
    }
  }
  
  return scrapedResults
}

// Function to filter out duplicate or low-quality results
function filterUniqueResults(results: any[]): any[] {
  console.log(`Filtering ${results.length} results for uniqueness`)
  
  // First remove results with empty content
  const validResults = results.filter(result => result.content && result.content.trim().length > 100)
  
  // Then remove duplicate URLs
  const uniqueUrls = new Set()
  const uniqueResults = []
  
  for (const result of validResults) {
    if (!uniqueUrls.has(result.url)) {
      uniqueUrls.add(result.url)
      uniqueResults.push(result)
    }
  }
  
  // Limit to top 10 results to avoid token limits
  return uniqueResults.slice(0, 10)
}

// Function to generate analysis from search results
async function generateAnalysis(
  results: any[],
  marketQuestion: string,
  previousContext: string,
  focusText?: string
): Promise<string> {
  console.log('Generating analysis from search results')
  
  // Prepare the content for analysis
  const contentForAnalysis = results.map(result => {
    return `URL: ${result.url}\nTitle: ${result.title}\nContent: ${result.content}\n---\n`
  }).join('\n')
  
  try {
    const response = await supabaseClient.functions.invoke('analyze-web-content', {
      body: {
        content: contentForAnalysis,
        marketQuestion,
        previousContext,
        focusText
      }
    })
    
    if (response.error) {
      console.error('Error in analyze-web-content:', response.error)
      throw new Error(`Error in analyze-web-content: ${response.error.message || JSON.stringify(response.error)}`)
    }
    
    return response.data.analysis || 'No analysis generated'
  } catch (error) {
    console.error('Error generating analysis:', error)
    return `Error generating analysis: ${error.message}`
  }
}

// Function to generate final analysis from all iterations
async function generateFinalAnalysis(
  iterations: any[],
  marketQuestion: string,
  focusText?: string
): Promise<any> {
  console.log('Generating final analysis')
  
  // Compile all insights from iterations
  const allInsights = iterations
    .map(iteration => `Iteration ${iteration.iteration} insights:\n${iteration.insights}`)
    .join('\n\n')
  
  // Compile sources
  const allSources = iterations
    .flatMap(iteration => iteration.sources || [])
    .filter((source, index, self) => 
      // Filter unique sources by URL
      index === self.findIndex(s => s.url === source.url)
    )
    .slice(0, 20) // Limit sources to avoid token limits
  
  try {
    // First, generate structured insights
    const structuredInsights = await generateAnalysisWithStreaming(
      allInsights,
      marketQuestion,
      focusText
    )
    
    // Return combined results
    return {
      data: allSources,
      analysis: allInsights,
      structuredInsights
    }
  } catch (error) {
    console.error('Error generating final analysis:', error)
    return {
      data: allSources,
      analysis: allInsights,
      structuredInsights: { error: error.message }
    }
  }
}

// Function to generate structured analysis with streaming response
async function generateAnalysisWithStreaming(
  insights: string,
  marketQuestion: string,
  focusText?: string
): Promise<any> {
  console.log('Generating structured analysis with OpenRouter API')
  
  try {
    const focusPrompt = focusText ? `\n\nPay special attention to: ${focusText}` : ''
    
    const systemPrompt = `You are a precise analyst evaluating market predictions. Review the research insights and determine:
1. The most likely probability of the event occurring (as a percentage)
2. Key areas that need more research
3. A concise final analysis${focusPrompt}

Be specific and data-driven in your evaluation.`

    const userPrompt = `Market Question: ${marketQuestion}

Research Insights:
${insights}

Based on this analysis, provide:
1. A probability estimate (just the number, e.g. "75%")
2. 2-3 key areas that need more research
3. A concise final analysis explaining the reasoning

Format your response as JSON with these fields:
{
  "probability": "X%",
  "areasForResearch": ["area1", "area2", ...],
  "analysis": "your analysis here"
}`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    try {
      // Try to parse as JSON
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/{[\s\S]*?}/)
      const jsonContent = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content
      
      return JSON.parse(jsonContent.replace(/^```json|```$/g, '').trim())
    } catch (jsonError) {
      console.warn('Failed to parse JSON response, returning raw content', jsonError)
      return { analysis: content }
    }
  } catch (error) {
    console.error('Error in generateAnalysisWithStreaming:', error)
    throw error
  }
}
