
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') as string

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function updateJobStatus(jobId: string, status: string, errorMsg?: string) {
  const { error } = await supabase.rpc('update_research_job_status', {
    job_id: jobId,
    new_status: status,
    error_msg: errorMsg
  })
  
  if (error) {
    console.error("Error updating job status:", error)
    throw error
  }
}

async function appendProgressLog(jobId: string, message: string) {
  // Convert the string message to a proper JSON string
  const progressEntry = JSON.stringify(message)
  
  // Use raw SQL query to append to the JSONB array
  const { error } = await supabase.from('research_jobs')
    .update({ 
      progress_log: `progress_log || '${progressEntry}'::jsonb`,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)
    .is('deleted_at', null)
  
  if (error) {
    console.error("Error appending to progress log:", error)
    throw error
  }
}

async function updateResearchResults(jobId: string, results: any) {
  const { error } = await supabase.rpc('update_research_results', {
    job_id: jobId,
    result_data: results
  })
  
  if (error) {
    console.error("Error updating research results:", error)
    throw error
  }
}

async function getMarketPrice(marketId: string) {
  const { data, error } = await supabase
    .from('market_prices')
    .select('last_traded_price')
    .eq('market_id', marketId)
    .order('timestamp', { ascending: false })
    .limit(1)
    
  if (error) {
    console.error("Error fetching market price:", error)
    return null
  }
  
  if (data && data.length > 0 && data[0].last_traded_price !== null) {
    const priceAsPercentage = Math.round(data[0].last_traded_price * 100)
    console.log(`Found market price for final analysis ${marketId}: ${priceAsPercentage}%`)
    return priceAsPercentage
  }
  
  return null
}

async function generateAnalysisWithStreaming(
  iteration: number, 
  content: string, 
  query: string, 
  jobId: string, 
  currentIterations: any[]
) {
  console.log(`Generating analysis for iteration ${iteration} with content length ${content.length}`)
  
  try {
    const prompt = `You are a professional market research analyst tasked with analyzing web content related to the question: ${query}.
    
Your goal is to extract relevant information, identify key insights, and provide a balanced analysis of the evidence.

First, analyze the following web content:

${content}

Provide a thorough analysis that:
1. Summarizes the key points and evidence related to the question
2. Evaluates the credibility and relevance of the information
3. Identifies any potential biases or limitations in the sources
4. Draws preliminary conclusions based on the available evidence
5. Suggests additional aspects that need further research

Be objective, thorough, and focus on providing actionable insights.`

    let analysisText = ""
    let reasoningText = ""
    const updatedIterations = [...currentIterations]
    const currentIterationIndex = updatedIterations.findIndex(i => i.iteration === iteration)
    
    if (currentIterationIndex === -1) {
      // Create a new iteration entry if it doesn't exist
      updatedIterations.push({
        iteration,
        analysis: "",
        reasoning: "",
        queries: [],
        results: []
      })
    }
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1",
        messages: [
          {
            role: "system",
            content: "You are a professional market research analyst that provides detailed analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true,
        temperature: 0.3,
        reasoning: {
          effort: "high"
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("Failed to get reader from response")
    }
    
    const decoder = new TextDecoder()
    let buffer = ""
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        console.log("Analysis stream complete")
        break
      }
      
      const chunk = decoder.decode(value)
      buffer += chunk
      
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      
      for (const line of lines) {
        if (line.trim() === "") continue
        
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6)
          
          if (jsonStr === "[DONE]") continue
          
          try {
            const jsonData = JSON.parse(jsonStr)
            
            if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta) {
              const { content, reasoning } = jsonData.choices[0].delta
              
              if (content) {
                analysisText += content
              }
              
              if (reasoning) {
                reasoningText += reasoning
              }
              
              // Update both content and reasoning in the iterations
              const updatedIterationIndex = updatedIterations.findIndex(i => i.iteration === iteration)
              if (updatedIterationIndex >= 0) {
                updatedIterations[updatedIterationIndex] = {
                  ...updatedIterations[updatedIterationIndex],
                  analysis: analysisText,
                  reasoning: reasoningText
                }
                
                // Update iterations in the database
                const { error } = await supabase.rpc('update_research_results', {
                  job_id: jobId,
                  result_data: { iterations: updatedIterations }
                })
                
                if (error) {
                  console.error("Error updating research results:", error)
                }
              }
            }
          } catch (e) {
            console.error("Error parsing JSON:", e)
            // Continue processing other chunks
          }
        }
      }
    }
    
    return {
      analysis: analysisText,
      reasoning: reasoningText,
      iterations: updatedIterations
    }
  } catch (error) {
    console.error("Error generating analysis:", error)
    throw error
  }
}

async function generateFinalAnalysisWithStreaming(
  content: string, 
  query: string, 
  marketPrice: number | null, 
  jobId: string, 
  currentIterations: any[]
) {
  console.log(`Generating final analysis with content length ${content.length}`)
  console.log(`Market price for final analysis: ${marketPrice !== null ? marketPrice + '%' : 'unknown'}`)
  
  try {
    const marketPriceContext = marketPrice !== null 
      ? `The current market price for this question is ${marketPrice}%, indicating the market's estimation of probability.` 
      : "The market price is unknown."
      
    const prompt = `You are a professional market research analyst tasked with providing a final analysis related to the question: ${query}.
    
${marketPriceContext}

Your goal is to synthesize all the research findings and provide a comprehensive final analysis.

Based on the research conducted across multiple iterations:

${content}

Provide a thorough final analysis that:
1. Synthesizes all key findings and insights related to the question
2. Evaluates the overall strength of evidence
3. Discusses implications and possible future developments
4. Provides a final assessment of the probability based on the evidence (expressed as a percentage)
5. Identifies any remaining uncertainties or research gaps

Be objective, thorough, and focus on providing a well-reasoned probability estimate with supporting evidence.`

    let analysisText = ""
    let reasoningText = ""
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1",
        messages: [
          {
            role: "system",
            content: "You are a professional market research analyst that provides detailed analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true,
        temperature: 0.3,
        reasoning: {
          effort: "high"
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("Failed to get reader from response")
    }
    
    const decoder = new TextDecoder()
    let buffer = ""
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        console.log("Final analysis stream complete")
        break
      }
      
      const chunk = decoder.decode(value)
      buffer += chunk
      
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      
      for (const line of lines) {
        if (line.trim() === "") continue
        
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6)
          
          if (jsonStr === "[DONE]") continue
          
          try {
            const jsonData = JSON.parse(jsonStr)
            
            if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta) {
              const { content, reasoning } = jsonData.choices[0].delta
              
              if (content) {
                analysisText += content
              }
              
              if (reasoning) {
                reasoningText += reasoning
              }
              
              // Update results in the database
              const results = {
                analysis: analysisText,
                reasoning: reasoningText,
                iterations: currentIterations
              }
              
              const { error } = await supabase.rpc('update_research_results', {
                job_id: jobId,
                result_data: results
              })
              
              if (error) {
                console.error("Error updating research results:", error)
              }
            }
          } catch (e) {
            console.error("Error parsing JSON:", e)
            // Continue processing other chunks
          }
        }
      }
    }
    
    return {
      analysis: analysisText,
      reasoning: reasoningText,
      iterations: currentIterations
    }
  } catch (error) {
    console.error("Error generating final analysis:", error)
    throw error
  }
}

async function createResearchJob(marketId: string, query: string, maxIterations: number = 3, focusText?: string, notificationEmail?: string) {
  try {
    console.log(`Creating research job: market=${marketId}, query=${query}, maxIterations=${maxIterations}`)
    console.log(`Focus text: ${focusText || 'none'}, Notification email: ${notificationEmail || 'none'}`)
    
    // Create a new research job record in the database
    const { data: job, error } = await supabase
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        max_iterations: maxIterations,
        focus_text: focusText,
        notification_email: notificationEmail,
        notification_sent: false,
        status: 'queued',
        progress_log: [],
        iterations: []
      })
      .select()
      .single()
    
    if (error) {
      console.error("Error creating research job:", error)
      throw error
    }
    
    console.log(`Research job created with ID: ${job.id}`)
    return job.id
  } catch (error) {
    console.error("Error in createResearchJob:", error)
    throw error
  }
}

async function processJob(jobId: string) {
  try {
    // Get job info from database
    const { data: job, error } = await supabase
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    
    if (error || !job) {
      throw error || new Error("Job not found")
    }
    
    // Update job status to processing
    await updateJobStatus(jobId, 'processing')
    await appendProgressLog(jobId, "Research job started")
    
    // Extract the market ID and query
    const { market_id: marketId, query, max_iterations: maxIterations } = job
    
    // Log job information
    console.log(`Processing research job ${jobId} for market ${marketId}`)
    console.log(`Query: ${query}`)
    console.log(`Max iterations: ${maxIterations}`)
    
    // For each iteration
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // Update the current iteration in the job
      await supabase
        .from('research_jobs')
        .update({ current_iteration: iteration })
        .eq('id', jobId)
      
      // Log the start of the iteration
      await appendProgressLog(jobId, `Starting iteration ${iteration}`)
      
      // TODO: Implement actual research steps here
      // For now, we'll just simulate the process with a delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Generate some placeholder analysis for this iteration
      const placeholderResults = {
        iteration,
        queries: [`Query for iteration ${iteration}`],
        results: [{
          url: "https://example.com/result1",
          content: "Example content for result 1",
          title: "Example Result 1"
        }],
        analysis: "",
        reasoning: ""
      }
      
      // Get the current iterations
      const { data: currentJob } = await supabase
        .from('research_jobs')
        .select('results')
        .eq('id', jobId)
        .single()
      
      let currentIterations = []
      if (currentJob?.results?.iterations) {
        currentIterations = currentJob.results.iterations
      }
      
      // Add the new iteration
      currentIterations.push(placeholderResults)
      
      // Generate analysis with streaming (if this were a real implementation)
      await generateAnalysisWithStreaming(
        iteration,
        "Sample content to analyze for research.",
        query,
        jobId,
        currentIterations
      )
      
      // Log the completion of the iteration
      await appendProgressLog(jobId, `Completed iteration ${iteration}`)
    }
    
    // Get the market price for the final analysis
    const marketPrice = await getMarketPrice(marketId)
    
    // Generate the final analysis
    const { data: finalJob } = await supabase
      .from('research_jobs')
      .select('results')
      .eq('id', jobId)
      .single()
    
    let finalIterations = []
    if (finalJob?.results?.iterations) {
      finalIterations = finalJob.results.iterations
    }
    
    // Combine all analyses from iterations
    const combinedAnalysis = finalIterations
      .map(iter => iter.analysis || "")
      .join("\n\n")
    
    // Generate the final analysis with streaming
    await generateFinalAnalysisWithStreaming(
      combinedAnalysis,
      query,
      marketPrice,
      jobId,
      finalIterations
    )
    
    // Update job status to completed
    await updateJobStatus(jobId, 'completed')
    await appendProgressLog(jobId, "Research job completed successfully")
    
    console.log(`Job ${jobId} completed successfully`)
    
    return { success: true, jobId }
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error)
    
    // Update job status to failed
    try {
      await updateJobStatus(jobId, 'failed', error.message)
      await appendProgressLog(jobId, `Research job failed: ${error.message}`)
    } catch (statusError) {
      console.error("Error updating job status:", statusError)
    }
    
    return { success: false, error: error.message, jobId }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    // Parse the request body to get marketId, query, maxIterations, etc.
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json()
    
    if (!marketId || !query) {
      throw new Error("marketId and query are required")
    }
    
    // Create a new research job in the database
    const jobId = await createResearchJob(
      marketId, 
      query, 
      maxIterations, 
      focusText, 
      notificationEmail
    )
    
    // Process the job asynchronously
    // @ts-ignore - EdgeRuntime may not be recognized by TypeScript
    EdgeRuntime.waitUntil(
      processJob(jobId).catch(error => 
        console.error(`Unhandled error in job processing for ${jobId}:`, error)
      )
    )
    
    return new Response(
      JSON.stringify({ message: "Job processing started", jobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Error in create-research-job function:", error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    )
  }
})
