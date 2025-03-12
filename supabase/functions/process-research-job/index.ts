import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const BING_API_KEY = Deno.env.get('BING_API_KEY')
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create a Supabase client with the service role key for internal operations
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function generateSubQueries(query: string, focusText?: string, iteration?: number): Promise<string[]> {
  console.log('Generating sub-queries for:', query, focusText ? `with focus: ${focusText}` : '', `iteration: ${iteration || 1}`)
  
  try {
    const systemPrompt = focusText 
      ? `You are a helpful assistant that generates search queries focused specifically on: ${focusText}`
      : 'You are a helpful assistant that generates search queries.';
      
    const userPrompt = `Generate 5 diverse search queries to gather comprehensive information about the following topic:
${query}
${focusText ? `With specific focus on: "${focusText}"` : ''}
${iteration && iteration > 1 ? `This is iteration ${iteration}, so make these queries different from basic initial searches.` : ''}

CRITICAL GUIDELINES FOR QUERIES:
1. Each query MUST be self-contained and provide full context - a search engine should understand exactly what you're asking without any external context
2. Include specific entities, dates, events, or proper nouns from the original question
3. AVOID vague terms like "this event", "the topic", or pronouns without clear referents
4. Make each query a complete, standalone question or statement that contains ALL relevant context
5. If the original question asks about a future event, include timeframes or dates
6. Use precise terminology and specific entities mentioned in the original question

Focus on different aspects that would be relevant for market research. Make each query different from the others to gather a wide range of information.

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    const queriesData = JSON.parse(content)
    let queries = queriesData.queries || []
    
    // Process queries to ensure each has full context
    queries = queries.map((q: string) => {
      // Check for common issues in queries
      if (q.includes("this") || q.includes("that") || q.includes("the event") || q.includes("the topic")) {
        // Add original query context
        return `${q} regarding ${query}`
      }
      
      // Check if query likely has enough context
      const hasNames = /[A-Z][a-z]+/.test(q) // Has proper nouns
      const isLongEnough = q.length > 40     // Is reasonably detailed
      
      if (!hasNames || !isLongEnough) {
        // Add more context
        if (focusText) {
          return `${q} about ${query} focused on ${focusText}`
        } else {
          return `${q} about ${query}`
        }
      }
      
      return q
    })
    
    console.log('Generated queries:', queries)
    return queries

  } catch (error) {
    console.error("Error generating queries:", error)
    // Generate fallback queries with full context
    const fallbackQueries = [
      `${query} latest developments and facts`,
      `${query} comprehensive analysis and expert opinions`,
      `${query} historical precedents and similar cases`,
      `${query} statistical data and probability estimates`,
      `${query} future outlook and critical factors`
    ]
    
    if (focusText) {
      // Add focused variants
      return [
        `${focusText} in relation to ${query} analysis`,
        `${query} specifically regarding ${focusText}`,
        `${focusText} impact on ${query} outcome`,
        `${query} factual information related to ${focusText}`,
        `${focusText} historical precedents for ${query}`
      ]
    }
    
    return fallbackQueries
  }
}

async function searchBing(query: string, apiKey: string) {
  console.log(`Searching Bing for: ${query}`)
  
  const headers = {
    "Ocp-Apim-Subscription-Key": apiKey
  }
  
  const params = new URLSearchParams({
    q: query,
    count: "50",
    responseFilter: "Webpages"
  })

  try {
    const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, { headers })
    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`)
    }
    const data = await response.json()
    const results = data.webPages?.value || []
    console.log(`Found ${results.length} search results`)
    return results
  } catch (error) {
    console.error("Search error:", error)
    return []
  }
}

async function fetchAndParseContent(url: string, seenUrls: Set<string>): Promise<{url: string, content: string, title?: string} | null> {
  // Skip certain domains or already processed URLs
  const skipDomains = ['reddit.com', 'facebook.com', 'twitter.com', 'instagram.com']
  if (skipDomains.some(domain => url.includes(domain)) || seenUrls.has(url)) return null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) return null

    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/html')) return null

    const html = await response.text()
    
    // Simple HTML parsing to extract content and title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : undefined
    
    // Strip HTML tags and get text content
    const content = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 5000) // Limit content length
    
    if (content) {
      seenUrls.add(url)
      return { url, content, title }
    }
    return null
  } catch (error) {
    // Skip failed URLs silently
    return null
  }
}

async function analyzeContent(content: string, query: string, marketId: string | null = null) {
  console.log('Analyzing content for query:', query)
  
  try {
    const systemPrompt = `You are a market analysis expert working on a prediction market platform. You analyze web research to provide accurate probability assessments.`;
      
    const userPrompt = `Analyze the following research information about this question/market: 
${query}

${content}

Please provide:
1. A detailed analysis of the information (750-1500 words)
2. A probability assessment: What is the likelihood of this event occurring based on the evidence?
3. Key areas that need more research to improve the assessment

Format your response as Markdown.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-opus:beta",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const analysis = result.choices[0].message.content.trim()
    
    return analysis
  } catch (error) {
    console.error("Error analyzing content:", error)
    return "Error analyzing content: " + (error instanceof Error ? error.message : String(error))
  }
}

async function extractInsights(analysis: string, query: string) {
  console.log('Extracting insights from analysis')
  
  try {
    const systemPrompt = `You are a market analysis expert working on a prediction market platform.`;
      
    const userPrompt = `Based on the following analysis about this question/market: 
${query}

ANALYSIS:
${analysis}

Extract and provide the following in JSON format:
{
  "probability": "A percentage or probability range (e.g., '60-65%', '~30%', etc.)",
  "areasForResearch": ["Area 1", "Area 2", "Area 3"],
  "reasoning": "A brief 2-3 sentence explanation of the probability estimate"
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    
    // Parse the JSON response
    try {
      const insights = JSON.parse(content)
      return insights
    } catch (parseError) {
      console.error("Error parsing insights JSON:", parseError)
      return {
        probability: "Unknown (parsing error)",
        areasForResearch: ["Error parsing response"],
        reasoning: "Error parsing model output: " + String(parseError)
      }
    }
  } catch (error) {
    console.error("Error extracting insights:", error)
    return {
      probability: "Unknown (error occurred)",
      areasForResearch: ["Error occurred during analysis"],
      reasoning: "An error occurred during analysis: " + (error instanceof Error ? error.message : String(error))
    }
  }
}

async function processResearchIteration(jobId: string, iteration: number) {
  console.log(`Processing iteration ${iteration} for job ${jobId}`)
  
  try {
    // Get the job details
    const { data: job, error: jobError } = await adminClient
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    
    if (jobError || !job) {
      throw new Error(`Failed to get job details: ${jobError?.message || 'Job not found'}`)
    }
    
    // Update job status to running if it's the first iteration
    if (iteration === 1) {
      await adminClient
        .from('research_jobs')
        .update({ 
          status: 'running',
          started_at: new Date().toISOString(),
          current_iteration: 1,
          progress_log: [...(job.progress_log || []), `Starting research job with ${job.max_iterations} iterations`]
        })
        .eq('id', jobId)
    } else {
      await adminClient
        .from('research_jobs')
        .update({ 
          current_iteration: iteration,
          progress_log: [...(job.progress_log || []), `Starting iteration ${iteration} of ${job.max_iterations}`]
        })
        .eq('id', jobId)
    }
    
    // Generate queries based on the job and iteration
    let queries: string[]
    if (iteration === 1) {
      queries = await generateSubQueries(job.query, job.focus_text)
    } else {
      // Get previous iterations and analysis for context
      const previousIterations = job.iterations || []
      const previousAnalyses = previousIterations.map((iter: any) => iter.analysis).join('\n\n')
      
      queries = await generateSubQueries(
        job.query, 
        job.focus_text, 
        iteration
      )
    }
    
    // Update progress log
    await adminClient
      .from('research_jobs')
      .update({ 
        progress_log: [...(job.progress_log || []), 
          `Generated ${queries.length} search queries for iteration ${iteration}`,
          ...queries.map((q, i) => `Query ${i+1}: ${q}`)
        ]
      })
      .eq('id', jobId)
    
    // Search results for each query
    const allResults: any[] = []
    const seenUrls = new Set<string>()
    
    for (const [queryIndex, query] of queries.entries()) {
      // Update progress log
      await adminClient
        .from('research_jobs')
        .update({ 
          progress_log: [...(job.progress_log || []), `Processing query ${queryIndex+1}/${queries.length}: ${query}`]
        })
        .eq('id', jobId)
      
      // Search Bing
      const searchResults = await searchBing(query, BING_API_KEY!)
      
      // Process search results in parallel with limits
      const batchSize = 10
      const iterationResults = []
      
      for (let startIdx = 0; startIdx < searchResults.length; startIdx += batchSize) {
        const batchUrls = searchResults.slice(startIdx, startIdx + batchSize).map((result: any) => result.url)
        
        // Process batch in parallel
        const promises = batchUrls.map(url => fetchAndParseContent(url, seenUrls))
        const results = await Promise.all(promises)
        
        // Filter out nulls and add valid results
        const validResults = results.filter(result => result !== null) as {url: string, content: string, title?: string}[]
        
        if (validResults.length > 0) {
          iterationResults.push(...validResults)
          allResults.push(...validResults)
          
          // Update progress log
          await adminClient
            .from('research_jobs')
            .update({ 
              progress_log: [...(job.progress_log || []), `Found ${validResults.length} valid results for query ${queryIndex+1}`]
            })
            .eq('id', jobId)
        }
      }
    }
    
    // Update progress log
    await adminClient
      .from('research_jobs')
      .update({ 
        progress_log: [...(job.progress_log || []), `Completed search for iteration ${iteration}, found ${allResults.length} total results`]
      })
      .eq('id', jobId)
    
    // Skip analysis if no results found
    if (allResults.length === 0) {
      // Update progress log with error
      await adminClient
        .from('research_jobs')
        .update({ 
          progress_log: [...(job.progress_log || []), `No results found for iteration ${iteration}, skipping analysis`]
        })
        .eq('id', jobId)
      
      // If this was the first iteration, mark as failed
      if (iteration === 1) {
        await adminClient
          .from('research_jobs')
          .update({ 
            status: 'failed',
            error_message: 'No search results found',
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId)
      } else {
        // Otherwise, proceed with final analysis of previous iterations
        if (iteration >= job.max_iterations) {
          await finalizeResearch(jobId)
        }
      }
      
      return
    }
    
    // Analyze the results
    const contentToAnalyze = allResults.map(result => result.content).join('\n\n')
    
    // Update progress log
    await adminClient
      .from('research_jobs')
      .update({ 
        progress_log: [...(job.progress_log || []), `Analyzing content for iteration ${iteration}...`]
      })
      .eq('id', jobId)
    
    // Run analysis
    const analysisContent = await analyzeContent(contentToAnalyze, job.query, job.market_id)
    
    // Create iteration data
    const iterationData = {
      iteration,
      queries,
      results: allResults,
      analysis: analysisContent
    }
    
    // Retrieve current iterations
    const { data: updatedJob } = await adminClient
      .from('research_jobs')
      .select('iterations, results')
      .eq('id', jobId)
      .single()
    
    const currentIterations = updatedJob?.iterations || []
    const currentResults = updatedJob?.results || []
    
    // Update job with iteration results
    await adminClient
      .from('research_jobs')
      .update({ 
        iterations: [...currentIterations, iterationData],
        results: [...currentResults, ...allResults.filter(r => !currentResults.some((cr: any) => cr.url === r.url))],
        progress_log: [...(job.progress_log || []), `Completed analysis for iteration ${iteration}`]
      })
      .eq('id', jobId)
    
    // Check if this is the final iteration
    if (iteration >= job.max_iterations) {
      await finalizeResearch(jobId)
    } else {
      // Continue with next iteration
      await processResearchIteration(jobId, iteration + 1)
    }
  } catch (error) {
    console.error(`Error processing iteration ${iteration} for job ${jobId}:`, error)
    
    // Update job with error
    await adminClient
      .from('research_jobs')
      .update({ 
        progress_log: [...(await getCurrentProgressLog(jobId)), 
          `Error in iteration ${iteration}: ${error instanceof Error ? error.message : String(error)}`],
        error_message: `Error in iteration ${iteration}: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

async function getCurrentProgressLog(jobId: string): Promise<string[]> {
  const { data } = await adminClient
    .from('research_jobs')
    .select('progress_log')
    .eq('id', jobId)
    .single()
  
  return data?.progress_log || []
}

async function finalizeResearch(jobId: string) {
  console.log(`Finalizing research for job ${jobId}`)
  
  try {
    // Get the job with all iterations
    const { data: job, error: jobError } = await adminClient
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    
    if (jobError || !job) {
      throw new Error(`Failed to get job details: ${jobError?.message || 'Job not found'}`)
    }
    
    // Update progress log
    await adminClient
      .from('research_jobs')
      .update({ 
        progress_log: [...(job.progress_log || []), `Starting final analysis...`]
      })
      .eq('id', jobId)
    
    // Compile all analysis content
    const iterations = job.iterations || []
    const allAnalysis = iterations.map((iter: any) => iter.analysis).join('\n\n')
    
    // Set the combined analysis
    await adminClient
      .from('research_jobs')
      .update({ 
        analysis: allAnalysis,
        progress_log: [...(job.progress_log || []), `Compiled analysis from all iterations`]
      })
      .eq('id', jobId)
    
    // Extract insights for final probability and areas for research
    const insights = await extractInsights(allAnalysis, job.query)
    
    // Update job as completed
    await adminClient
      .from('research_jobs')
      .update({ 
        status: 'completed',
        probability: insights.probability,
        areas_for_research: insights.areasForResearch,
        completed_at: new Date().toISOString(),
        progress_log: [...(job.progress_log || []), 
          `Research complete with probability: ${insights.probability}`,
          `Areas for further research: ${insights.areasForResearch.join(', ')}`
        ]
      })
      .eq('id', jobId)
    
    // Save to web_research table for compatibility with existing UI
    const { data: user } = await adminClient.auth.getUser()
    
    await adminClient
      .from('web_research')
      .insert({
        user_id: job.user_id,
        query: job.query,
        sources: job.results,
        analysis: job.analysis || allAnalysis,
        probability: insights.probability,
        areas_for_research: insights.areasForResearch,
        market_id: job.market_id,
        iterations: job.iterations,
        focus_text: job.focus_text,
        parent_research_id: job.parent_job_id
      })
    
    console.log(`Research job ${jobId} completed successfully`)
  } catch (error) {
    console.error(`Error finalizing research for job ${jobId}:`, error)
    
    // Update job with error
    await adminClient
      .from('research_jobs')
      .update({ 
        progress_log: [...(await getCurrentProgressLog(jobId)), 
          `Error finalizing research: ${error instanceof Error ? error.message : String(error)}`],
        error_message: `Error finalizing research: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { jobId } = await req.json()

    if (!jobId) {
      throw new Error('Job ID is required')
    }

    // Start processing in the background
    // Using EdgeRuntime.waitUntil to allow the function to continue running after response is sent
    const promise = processResearchIteration(jobId, 1)
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(promise)

    return new Response(
      JSON.stringify({ message: 'Research job started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in process-research-job function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
