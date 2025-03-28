
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

interface ResearchJobPayload {
  marketId: string;
  query: string;
  maxIterations: number;
  focusText?: string;
  notificationEmail?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { marketId, query, maxIterations, focusText, notificationEmail }: ResearchJobPayload = await req.json()

    if (!marketId || !query || !maxIterations) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const jobId = crypto.randomUUID()
    console.log(`Starting research job ${jobId} for market ${marketId} with query "${query}" and ${maxIterations} iterations`)

    // Create research job in database
    const { error } = await supabaseAdmin
      .from('research_jobs')
      .insert({
        id: jobId,
        market_id: marketId,
        query: query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: [`Research job created with ID: ${jobId}`],
        iterations: [],
        results: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: null,
        focus_text: focusText || null,
        notification_email: notificationEmail || null,
        notification_sent: false
      })

    if (error) {
      console.error("Error creating research job:", error)
      return new Response(JSON.stringify({ error: `Failed to create research job: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Start background processing
    // @ts-ignore - Deno globals
    EdgeRuntime.waitUntil(processResearchJob(jobId, marketId, query, maxIterations, focusText))

    return new Response(
      JSON.stringify({ jobId, message: "Research job created and processing started in background" }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error("Error in create-research-job function:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function processResearchJob(jobId: string, marketId: string, query: string, maxIterations: number, focusText?: string) {
  console.log(`[Background][${jobId}] Processing ${maxIterations} iterations in background`)

  try {
    // Update job status to processing
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress_log: arrayAppend('progress_log', 'Background processing started...')
      })
      .eq('id', jobId)

    // Process each iteration
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Starting iteration ${i} for job ${jobId}`)
      await processIteration(jobId, i, query, [], maxIterations, focusText)
    }

    // Finalize job
    await finalizeJob(jobId)

  } catch (error) {
    console.error(`Error processing research job ${jobId}:`, error)
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        progress_log: arrayAppend('progress_log', `Job failed: ${error.message}`),
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

async function processIteration(jobId: string, iteration: number, query: string, sources: any[], maxIterations: number, focusText?: string) {
  console.log(`Starting iteration ${iteration} for job ${jobId}`)

  try {
    // Update job status
    await supabaseAdmin
      .from('research_jobs')
      .update({
        current_iteration: iteration,
        progress_log: arrayAppend('progress_log', `Starting iteration ${iteration}...`)
      })
      .eq('id', jobId)

    // Generate search queries
    const searchQueries = [`${query} iteration ${iteration}`] // Replace with actual query generation logic
    console.log(`Generated search queries:`, searchQueries)

    // Perform web search
    const webResults = await performWebSearch(query, focusText)
    console.log(`Found ${webResults.length} web results`)

    // Extract relevant content from web results
    const relevantContent = webResults.map(result => ({ url: result.url, content: result.content })) // Replace with actual content extraction logic
    console.log(`Extracted ${relevantContent.length} relevant content snippets`)

    // Generate analysis prompt
    const analysisPrompt = generateAnalysisPrompt(query, relevantContent, iteration, maxIterations);
    
    // Instead of making a direct call to OpenRouter, we'll update the database to indicate
    // that we're starting the analysis and the client will connect via WebSocket
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'processing',
        current_iteration: iteration,
        progress_log: arrayAppend('progress_log', `Starting analysis for iteration ${iteration}...`),
        iterations: arrayAppend('iterations', {
          iteration,
          queries: searchQueries,
          results: relevantContent,
          analysis: "",
          reasoning: "",
          isAnalysisStreaming: true,
          isReasoningStreaming: true
        })
      })
      .eq('id', jobId);

    // Generate analysis using OpenRouter
    // const analysis = await generateAnalysis(analysisPrompt)
    // console.log(`Generated analysis:`, analysis)

    // Generate reasoning (optional)
    // const reasoning = await generateReasoning(analysis, relevantContent)
    // console.log(`Generated reasoning:`, reasoning)

    // Update job status with iteration results
    // await supabaseAdmin
    //   .from('research_jobs')
    //   .update({
    //     progress_log: arrayAppend('progress_log', `Iteration ${iteration} complete.`),
    //     iterations: arrayAppend('iterations', {
    //       iteration,
    //       queries: searchQueries,
    //       results: relevantContent,
    //       analysis: analysis,
    //       reasoning: reasoning
    //     })
    //   })
    //   .eq('id', jobId)

  } catch (error) {
    console.error(`Error processing iteration ${iteration} for job ${jobId}:`, error)
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        progress_log: arrayAppend('progress_log', `Iteration ${iteration} failed: ${error.message}`)
      })
      .eq('id', jobId)
  }
}

async function finalizeJob(jobId: string) {
  console.log(`Finalizing research job ${jobId}`)

  try {
    // Aggregate results and generate final analysis
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from('research_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError) {
      throw new Error(`Failed to fetch job data: ${jobError.message}`)
    }

    if (!jobData) {
      throw new Error(`Job data not found for ID: ${jobId}`)
    }

    const allResults = jobData.iterations.flatMap(iteration => iteration.results)
    console.log(`Aggregated ${allResults.length} results from all iterations`)

    const finalAnalysisPrompt = generateFinalAnalysisPrompt(jobData.query, allResults)
    const finalAnalysis = await generateAnalysis(finalAnalysisPrompt)
    console.log(`Generated final analysis:`, finalAnalysis)

    // Extract structured insights
    const structuredInsights = await extractStructuredInsights(finalAnalysis)
    console.log(`Extracted structured insights:`, structuredInsights)

    // Update job status with final results
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'completed',
        results: {
          data: allResults,
          analysis: finalAnalysis,
          structuredInsights: structuredInsights
        },
        progress_log: arrayAppend('progress_log', 'Job completed successfully.'),
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

    // Send notification email (if requested)
    if (jobData.notification_email && !jobData.notification_sent) {
      await sendNotificationEmail(jobData.notification_email, jobId, finalAnalysis)
      await supabaseAdmin
        .from('research_jobs')
        .update({ notification_sent: true })
        .eq('id', jobId)
    }

  } catch (error) {
    console.error(`Error finalizing research job ${jobId}:`, error)
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        progress_log: arrayAppend('progress_log', `Job finalization failed: ${error.message}`),
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

async function performWebSearch(query: string, focusText?: string) {
  const webResearchUrl = "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/web-research"
  
  try {
    // Create a collector for the results
    const results = [];

    // Make the request
    const response = await fetch(webResearchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
      },
      body: JSON.stringify({ query, focusText })
    });

    if (!response.ok) {
      throw new Error(`Web research function failed: ${response.status}`);
    }

    // For SSE responses, we need to read the stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get reader from response");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    // Process the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || ""; // Keep the incomplete chunk for next iteration
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.substring(6); // Remove "data: " prefix
            const data = JSON.parse(jsonStr);
            
            if (data.type === 'results' && Array.isArray(data.data)) {
              // Add results to our collector
              results.push(...data.data);
            }
          } catch (e) {
            console.error("Error parsing SSE message:", e);
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Error in web research:", error);
    throw error;
  }
}

async function generateAnalysis(prompt: string) {
  try {
    const response = await fetch(OPENROUTER_URL, {
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
            content: "You are analyzing research content to provide insights."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    return content

  } catch (error) {
    console.error("Error generating analysis:", error)
    throw new Error(`Failed to generate analysis: ${error.message}`)
  }
}

async function generateReasoning(analysis: string, sources: any[]) {
  // Implement reasoning generation logic here
  return "Reasoning not implemented yet."
}

async function extractStructuredInsights(analysis: string) {
  // Implement structured insights extraction logic here
  return {
    probability: "50%",
    areasForResearch: ["Area 1", "Area 2"]
  }
}

async function sendNotificationEmail(email: string, jobId: string, analysis: string) {
  const sendResearchNotificationUrl = "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/send-research-notification"
  const response = await fetch(sendResearchNotificationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
    },
    body: JSON.stringify({ email, jobId, analysis })
  })

  if (!response.ok) {
    console.error(`Failed to send notification email: ${response.status}`)
  } else {
    console.log(`Notification email sent successfully to ${email}`)
  }
}

function generateAnalysisPrompt(query: string, sources: any[], iteration: number, maxIterations: number): string {
  const sourceContent = sources.map(source => `Source URL: ${source.url}\nContent: ${source.content}`).join('\n\n')
  return `You are an expert market research analyst. Analyze the following research content related to the query "${query}" to identify key insights and potential market opportunities.
  This is iteration ${iteration} of ${maxIterations}.
  Research Content:\n${sourceContent}`
}

function generateFinalAnalysisPrompt(query: string, sources: any[]): string {
  const sourceContent = sources.map(source => `Source URL: ${source.url}\nContent: ${source.content}`).join('\n\n')
  return `You are an expert market research analyst. Analyze the following research content related to the query "${query}" to provide a comprehensive final analysis.
  Research Content:\n${sourceContent}`
}

const arrayAppend = (item) => {
  return {
    'args': {
      'item': item
    },
    'name': 'array_append'
  }
}
