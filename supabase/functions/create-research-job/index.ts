import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0'

interface Job {
  id: string;
  market_id: string;
  query: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  results: any;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  user_id?: string;
  focus_text?: string;
  notification_email?: string;
  notification_sent?: boolean;
  final_analysis_stream?: string;
}

interface SearchResult {
  url: string;
  content: string;
  title?: string;
}

interface IterationResult {
  iteration: number;
  queries: string[];
  results: SearchResult[];
  analysis: string;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})

// In the generateFinalAnalysisWithStreaming function, replace searchResults with allResults
async function generateFinalAnalysisWithStreaming(job: Job, allResults: SearchResult[], allAnalyses: string[]) {
  console.log(`Starting final analysis for job ${job.id}, with ${allResults.length} search results`);
  
  try {
    // Build the system prompt with all prior information
    const systemPrompt = `You are an expert research analyst tasked with producing a comprehensive final analysis for a prediction market question.
    
    The question is: "${job.query}"
    
    You will be provided with search results and previous analyses from multiple research iterations.
    Your task is to synthesize all this information into a detailed, well-reasoned final analysis.
    
    Focus on:
    1. Providing a clear assessment of the likelihood of the event occurring
    2. Highlighting the most important evidence from the search results
    3. Analyzing conflicting information and explaining your reasoning
    4. Maintaining objectivity and citing specific sources when possible
    
    Format your analysis in clear, well-organized paragraphs with headings as appropriate.`;

    // Prepare the content to analyze
    const contentToAnalyze = allResults
      .map((result, index) => {
        return `Source ${index + 1}: ${result.title || result.url}\n${result.content.substring(0, 1500)}`;
      })
      .join('\n\n');

    const previousAnalyses = allAnalyses.join('\n\n');

    const promptText = `Please provide a comprehensive final analysis for the question: "${job.query}".

    Here are the search results you should incorporate:
    ${contentToAnalyze}

    Here are previous iterations of analysis that you can build upon:
    ${previousAnalyses}

    Note: In your conclusion, please clearly explain whether the event in the question is likely to occur or not, 
    and provide a percentage probability estimate based on the available evidence.`;

    console.log(`Calling OpenAI for final analysis... prompt length: ${promptText.length}`);

    // Set up OpenAI API call with streaming
    const openai_url = "https://api.openai.com/v1/chat/completions";
    const openai_key = Deno.env.get("OPENAI_API_KEY");
    
    if (!openai_key) {
      throw new Error("OpenAI API key is not set");
    }

    // Prepare to stream the analysis back to the client
    let finalAnalysis = '';
    let chunkCounter = 0;

    try {
      const openai_response = await fetch(openai_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openai_key}`,
        },
        body: JSON.stringify({
          model: "gpt-4-turbo", // Using a more capable model for final analysis
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: promptText }
          ],
          temperature: 0.5,
          stream: true,
        }),
      });
      
      if (!openai_response.ok) {
        const errorText = await openai_response.text();
        throw new Error(`OpenAI API error: ${openai_response.status} ${errorText}`);
      }
      
      // Process the stream
      const reader = openai_response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get reader from response");
      }
      
      // Read and process each chunk
      const textDecoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // Decode the chunk
        const chunk = textDecoder.decode(value);
        
        // Parse individual SSE messages
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const contentChunk = data.choices?.[0]?.delta?.content || "";
              
              if (contentChunk) {
                // Append to our accumulated analysis
                finalAnalysis += contentChunk;
                
                // Stream to the database - these are chunks for display in the UI during streaming
                await supabase.rpc('append_analysis_chunk', {
                  job_id: job.id,
                  iteration: 0, // Final analysis uses iteration 0
                  chunk: contentChunk,
                  seq: chunkCounter++
                });
                
                // We also update the main job record periodically so even if the client is
                // not subscribed to analysis_stream, they'll still see progress
                if (chunkCounter % 5 === 0) {
                  await supabase.from('research_jobs')
                    .update({ final_analysis_stream: finalAnalysis })
                    .eq('id', job.id);
                }
              }
            } catch (error) {
              console.error("Error parsing SSE message:", error);
            }
          }
        }
      }
      
      // Save the final complete analysis to the job record
      await supabase.from('research_jobs')
        .update({ final_analysis_stream: finalAnalysis })
        .eq('id', job.id);

      console.log(`Final analysis generation complete for job ${job.id}, ${finalAnalysis.length} characters`);
      return finalAnalysis;
      
    } catch (error) {
      console.error(`Error generating final analysis: ${error.message}`);
      
      // Update job with error
      await supabase.from('research_jobs')
        .update({ 
          final_analysis_stream: `Error generating analysis: ${error.message}`,
          error_message: `Error in final analysis: ${error.message}`
        })
        .eq('id', job.id);
        
      return `Error generating analysis: ${error.message}`;
    }
  } catch (error) {
    console.error(`Error in generateFinalAnalysisWithStreaming: ${error.message}`);
    return `Error generating analysis: ${error.message}`;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { marketId, query, maxIterations, focusText, notificationEmail } = body;

    console.log('Function create-research-job called')
    console.log(`Received marketId: ${marketId}, query: ${query}, maxIterations: ${maxIterations}, focusText: ${focusText}, notificationEmail: ${notificationEmail}`)

    if (!marketId || !query || !maxIterations) {
      console.error('Missing parameters')
      return new Response(
        JSON.stringify({ error: 'Missing parameters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get user details
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('Failed to get user details:', authError)
      return new Response(
        JSON.stringify({ error: 'Failed to get user details' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const user_id = authData?.user?.id;

    // Create a new research job
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: [],
        iterations: [],
        results: null,
        user_id: user_id || null,
        focus_text: focusText || null,
        notification_email: notificationEmail || null,
        notification_sent: false
      })
      .select('*')
      .single()

    if (jobError) {
      console.error('Failed to create research job:', jobError)
      return new Response(
        JSON.stringify({ error: 'Failed to create research job' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Research job created with ID: ${job.id}`)

    // Start processing the research job
    processResearchJob(job as Job)
    
    return new Response(
      JSON.stringify({ jobId: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Caught error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function processResearchJob(job: Job) {
  console.log(`Starting research job processing for job ID: ${job.id}`)

  try {
    // Update job status to processing
    await supabase
      .from('research_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id)

    // Initialize variables
    let allResults: SearchResult[] = []
    let allAnalyses: string[] = []

    // Run the research iterations
    for (let i = 1; i <= job.max_iterations; i++) {
      console.log(`Starting iteration ${i} for job ID: ${job.id}`)

      // Generate search queries
      const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
        body: JSON.stringify({
          query: job.query,
          marketId: job.market_id,
          marketDescription: job.query,
          question: job.query,
          iteration: i,
          focusText: job.focus_text || null
        })
      })

      if (queriesError) {
        console.error(`Error generating queries for iteration ${i}:`, queriesError)
        throw new Error(`Error generating queries: ${queriesError.message}`)
      }

      if (!queriesData?.queries || !Array.isArray(queriesData.queries)) {
        console.error(`Invalid queries response for iteration ${i}:`, queriesData)
        throw new Error('Invalid queries response')
      }

      const queries = queriesData.queries;
      console.log(`Generated queries for iteration ${i}:`, queries)

      // Web scrape
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('web-scrape', {
        body: JSON.stringify({
          queries: queries,
          marketId: job.market_id,
          marketDescription: job.query,
          query: job.query,
          focusText: job.focus_text || null
        })
      })

      if (scrapeError) {
        console.error(`Error during web scraping for iteration ${i}:`, scrapeError)
        throw new Error(`Error during web scraping: ${scrapeError.message}`)
      }

      if (!scrapeData?.body) {
        console.error(`No body returned from web scraping for iteration ${i}`)
        throw new Error('No data returned from web scraping')
      }

      const iterationResults: SearchResult[] = []
      let iterationContent: string[] = [];

      try {
        const textDecoder = new TextDecoder()
        const reader = new Response(scrapeData.body).body?.getReader()

        if (!reader) {
          throw new Error('Failed to get reader from response')
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            console.log(`Stream reading complete for iteration ${i}`)
            break
          }

          const chunk = textDecoder.decode(value)
          buffer += chunk

          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()

              if (jsonStr === '[DONE]') {
                continue
              }

              try {
                const parsed = JSON.parse(jsonStr)

                if (parsed.type === 'results' && Array.isArray(parsed.data)) {
                  iterationResults.push(...parsed.data)
                  iterationContent.push(...parsed.data.map(r => r.content));
                } else if (parsed.type === 'message' && parsed.message) {
                  console.log(`Message from web-scrape: ${parsed.message}`)
                  await updateProgressLog(job.id, parsed.message)
                } else if (parsed.type === 'error' && parsed.message) {
                  console.error(`Error from web-scrape: ${parsed.message}`)
                  await updateProgressLog(job.id, `Error: ${parsed.message}`)
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, "Raw data:", jsonStr)
              }
            }
          }
        }
      } catch (streamError) {
        console.error(`Error processing stream for iteration ${i}:`, streamError);
        throw new Error(`Error processing stream: ${streamError.message}`);
      }

      allResults.push(...iterationResults);

      // Analyze content
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-web-content', {
        body: JSON.stringify({
          content: iterationContent.join('\n\n'),
          query: job.query,
          question: job.query,
          marketId: job.market_id,
          marketDescription: job.query,
          previousAnalyses: allAnalyses.join('\n\n')
        })
      })

      if (analysisError) {
        console.error(`Error during content analysis for iteration ${i}:`, analysisError)
        throw new Error(`Error during content analysis: ${analysisError.message}`)
      }

      if (!analysisData?.body) {
        console.error(`No body returned from content analysis for iteration ${i}`)
        throw new Error('No data returned from content analysis')
      }

      let analysis = '';

      try {
        const textDecoder = new TextDecoder();
        const reader = new Response(analysisData.body).body?.getReader();

        if (!reader) {
          throw new Error('Failed to get reader from analysis response');
        }

        let analysisContent = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log("Analysis stream complete");
            analysis = analysisContent;
            break;
          }

          const chunk = textDecoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const data = JSON.parse(jsonStr);
                const contentChunk = data.choices?.[0]?.delta?.content || "";

                if (contentChunk) {
                  analysisContent += contentChunk;
                }
              } catch (e) {
                console.debug('Error parsing SSE data:', e);
              }
            }
          }
        }
      } catch (analysisStreamError) {
        console.error(`Error processing analysis stream for iteration ${i}:`, analysisStreamError);
        throw new Error(`Error processing analysis stream: ${analysisStreamError.message}`);
      }

      allAnalyses.push(analysis);

      // Update job with iteration results
      const iterationResult = {
        iteration: i,
        queries: queries,
        results: iterationResults,
        analysis: analysis
      };

      await supabase
        .from('research_jobs')
        .update({
          current_iteration: i,
          iterations: [...job.iterations, iterationResult],
          progress_log: [...job.progress_log, `Completed iteration ${i}`]
        })
        .eq('id', job.id)

      console.log(`Completed iteration ${i} for job ID: ${job.id}`)
    }

    // Generate final analysis with streaming
    console.log(`Generating final analysis with streaming for job ID: ${job.id}`);
    const finalAnalysis = await generateFinalAnalysisWithStreaming(job, allResults, allAnalyses);
    console.log(`Final analysis generated for job ID: ${job.id}`);

    // Update job status to completed
    await supabase
      .from('research_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: { data: allResults, analysis: finalAnalysis },
        progress_log: [...job.progress_log, 'Research job completed']
      })
      .eq('id', job.id)

    console.log(`Research job completed for job ID: ${job.id}`)

    // Send notification email if requested
    if (job.notification_email && !job.notification_sent) {
      const { error: emailError } = await supabase.functions.invoke('send-completion-email', {
        body: JSON.stringify({
          email: job.notification_email,
          marketId: job.market_id,
          jobId: job.id
        })
      })

      if (emailError) {
        console.error('Failed to send completion email:', emailError)
        await updateProgressLog(job.id, `Failed to send completion email: ${emailError.message}`)
      } else {
        await supabase
          .from('research_jobs')
          .update({ notification_sent: true })
          .eq('id', job.id)
        console.log(`Completion email sent to ${job.notification_email} for job ID: ${job.id}`)
      }
    }
  } catch (error) {
    console.error('Error processing research job:', error)
    await supabase
      .from('research_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        progress_log: [...job.progress_log, `Research job failed: ${error.message}`]
      })
      .eq('id', job.id)
  }
}

async function updateProgressLog(jobId: string, message: string) {
  console.log(`Updating progress log for job ID: ${jobId} with message: ${message}`)
  const { data, error } = await supabase
    .from('research_jobs')
    .update({ progress_log: [...(await getJob(jobId)).progress_log, message] })
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update progress log:', error)
  }
}

async function getJob(jobId: string): Promise<Job> {
  const { data, error } = await supabase
    .from('research_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error) {
    console.error('Failed to get job:', error)
    throw new Error('Failed to get job')
  }

  return data as Job
}
