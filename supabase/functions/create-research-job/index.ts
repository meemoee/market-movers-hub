import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.0"

// Constants
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Create a Supabase client with the service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Global variables for job tracking
let jobId: string
let currentIteration: number

// Main function to handle the request
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json()
    
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: marketId and query' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Create a new research job in the database
    const newJobId = uuidv4()
    jobId = newJobId
    currentIteration = 0
    
    const { error: createError } = await supabaseAdmin
      .from('research_jobs')
      .insert({
        id: newJobId,
        market_id: marketId,
        query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: ['Job created, waiting to start...'],
        iterations: [],
        focus_text: focusText,
        notification_email: notificationEmail,
        notification_sent: false
      })
    
    if (createError) {
      console.error('Error creating research job:', createError)
      return new Response(
        JSON.stringify({ error: 'Failed to create research job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Start the research process in the background
    EdgeRuntime.waitUntil(
      processResearchJob(newJobId, query, maxIterations, focusText, notificationEmail)
    )
    
    // Return the job ID immediately
    return new Response(
      JSON.stringify({ jobId: newJobId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Error in create-research-job function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Main function to process the research job
async function processResearchJob(
  jobId: string, 
  query: string, 
  maxIterations: number,
  focusText?: string,
  notificationEmail?: string
) {
  try {
    // Update job status to processing
    await supabaseAdmin
      .from('research_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        progress_log: ['Job started processing...']
      })
      .eq('id', jobId)
    
    console.log(`Starting research job ${jobId} with query: ${query}`)
    
    // Initialize variables to track progress
    let allResults: any[] = []
    let iterations: any[] = []
    let finalAnalysis = ''
    
    // Process each iteration
    for (let i = 1; i <= maxIterations; i++) {
      currentIteration = i
      console.log(`Starting iteration ${i} of ${maxIterations}`)
      
      try {
        // Update progress in the database
        await supabaseAdmin
          .from('research_jobs')
          .update({ 
            current_iteration: i,
            progress_log: supabaseAdmin.rpc('append_to_array', {
              arr: supabaseAdmin.raw('progress_log'),
              item: `Starting iteration ${i} of ${maxIterations}...`
            })
          })
          .eq('id', jobId)
        
        // Generate search queries based on previous iterations
        const queries = await generateSearchQueries(
          OPENROUTER_API_KEY || '',
          query,
          iterations,
          focusText
        )
        
        // Update progress
        await supabaseAdmin
          .from('research_jobs')
          .update({ 
            progress_log: supabaseAdmin.rpc('append_to_array', {
              arr: supabaseAdmin.raw('progress_log'),
              item: `Generated ${queries.length} search queries for iteration ${i}`
            })
          })
          .eq('id', jobId)
        
        // Create a new iteration object
        const newIteration = {
          iteration: i,
          queries,
          results: [],
          analysis: ''
        }
        
        // Add the iteration to the database
        await supabaseAdmin
          .from('research_jobs')
          .update({ 
            iterations: supabaseAdmin.rpc('append_to_array', {
              arr: supabaseAdmin.raw('iterations'),
              item: newIteration
            })
          })
          .eq('id', jobId)
        
        // Fetch search results for each query
        const results = await fetchSearchResults(queries)
        
        // Update the iteration with the results
        newIteration.results = results
        
        // Update the iteration in the database
        await supabaseAdmin.rpc('update_iteration_field', {
          job_id: jobId,
          iteration_num: i,
          field_key: 'results',
          field_value: results
        })
        
        // Update progress
        await supabaseAdmin
          .from('research_jobs')
          .update({ 
            progress_log: supabaseAdmin.rpc('append_to_array', {
              arr: supabaseAdmin.raw('progress_log'),
              item: `Found ${results.length} results for iteration ${i}`
            })
          })
          .eq('id', jobId)
        
        // Generate analysis for this iteration
        const analysisResult = await generateAnalysisWithStreaming(
          OPENROUTER_API_KEY || '',
          query,
          results,
          iterations,
          focusText
        )
        
        // Update the iteration with the analysis
        newIteration.analysis = analysisResult.analysis
        if (analysisResult.reasoning) {
          newIteration.reasoning = analysisResult.reasoning
        }
        
        // Add the iteration to our local array
        iterations.push(newIteration)
        
        // Add results to the overall results array
        allResults = [...allResults, ...results]
        
        // Update progress
        await supabaseAdmin
          .from('research_jobs')
          .update({ 
            progress_log: supabaseAdmin.rpc('append_to_array', {
              arr: supabaseAdmin.raw('progress_log'),
              item: `Completed analysis for iteration ${i}`
            })
          })
          .eq('id', jobId)
        
      } catch (iterationError) {
        console.error(`Error in iteration ${i}:`, iterationError)
        
        // Update progress with the error
        await supabaseAdmin
          .from('research_jobs')
          .update({ 
            progress_log: supabaseAdmin.rpc('append_to_array', {
              arr: supabaseAdmin.raw('progress_log'),
              item: `Error in iteration ${i}: ${iterationError.message}`
            })
          })
          .eq('id', jobId)
        
        // If this is the first iteration and it failed, we should stop the job
        if (i === 1) {
          throw iterationError
        }
        
        // Otherwise, continue with the next iteration
        continue
      }
    }
    
    // Generate final analysis
    console.log('Generating final analysis...')
    
    // Update progress
    await supabaseAdmin
      .from('research_jobs')
      .update({ 
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: supabaseAdmin.raw('progress_log'),
          item: 'Generating final analysis...'
        })
      })
      .eq('id', jobId)
    
    const finalAnalysisResult = await generateFinalAnalysisWithStreaming(
      OPENROUTER_API_KEY || '',
      query,
      iterations,
      focusText
    )
    
    finalAnalysis = finalAnalysisResult.analysis
    
    // Generate structured insights
    console.log('Generating structured insights...')
    
    // Update progress
    await supabaseAdmin
      .from('research_jobs')
      .update({ 
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: supabaseAdmin.raw('progress_log'),
          item: 'Generating structured insights...'
        })
      })
      .eq('id', jobId)
    
    const structuredInsights = await generateStructuredInsights(
      OPENROUTER_API_KEY || '',
      query,
      finalAnalysis,
      focusText
    )
    
    // Prepare the final results
    const finalResults = {
      data: allResults,
      analysis: finalAnalysis,
      structuredInsights
    }
    
    // Update the job with the final results and mark as completed
    await supabaseAdmin
      .from('research_jobs')
      .update({ 
        status: 'completed',
        results: finalResults,
        completed_at: new Date().toISOString(),
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: supabaseAdmin.raw('progress_log'),
          item: 'Research job completed successfully'
        })
      })
      .eq('id', jobId)
    
    console.log(`Research job ${jobId} completed successfully`)
    
    // Send notification email if requested
    if (notificationEmail) {
      try {
        await sendNotificationEmail(notificationEmail, jobId, query)
        
        // Mark notification as sent
        await supabaseAdmin
          .from('research_jobs')
          .update({ notification_sent: true })
          .eq('id', jobId)
        
        console.log(`Notification email sent to ${notificationEmail}`)
      } catch (emailError) {
        console.error('Error sending notification email:', emailError)
      }
    }
    
  } catch (error) {
    console.error(`Error processing research job ${jobId}:`, error)
    
    // Update the job with the error and mark as failed
    await supabaseAdmin
      .from('research_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message,
        progress_log: supabaseAdmin.rpc('append_to_array', {
          arr: supabaseAdmin.raw('progress_log'),
          item: `Job failed: ${error.message}`
        })
      })
      .eq('id', jobId)
  }
}

// Function to generate search queries based on previous iterations
async function generateSearchQueries(
  openRouterApiKey: string,
  query: string,
  previousIterations: any[],
  focusText?: string
) {
  try {
    console.log('Generating search queries...')
    
    // Build the prompt for the AI
    let systemPrompt = `You are an expert research assistant. Your task is to generate effective search queries to find information about a topic.
Generate diverse queries that will help find comprehensive information about the topic.
Each query should be specific and focused on different aspects of the topic.
Do not include any explanations, just output a JSON array of strings.`

    let userPrompt = `Generate 5 effective search queries to find information about: "${query}"`
    
    if (focusText) {
      userPrompt += `\nFocus specifically on: ${focusText}`
    }
    
    // If we have previous iterations, include them in the prompt
    if (previousIterations.length > 0) {
      userPrompt += '\n\nPrevious iterations:'
      
      for (const iteration of previousIterations) {
        userPrompt += `\n\nIteration ${iteration.iteration}:`
        userPrompt += `\nQueries: ${JSON.stringify(iteration.queries)}`
        userPrompt += `\nAnalysis: ${iteration.analysis}`
      }
      
      userPrompt += '\n\nBased on the previous iterations, generate new search queries that will help find additional information or fill gaps in the research.'
    }
    
    // Call the OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Market Research App'
      },
      body: JSON.stringify({
        model: 'perplexity/llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }
    
    const data = await response.json()
    
    // Parse the response to extract the queries
    let queries: string[] = []
    
    try {
      const content = data.choices[0].message.content
      
      // Try to parse the content as JSON
      try {
        queries = JSON.parse(content)
      } catch (parseError) {
        // If parsing fails, try to extract queries using regex
        const matches = content.match(/["'](.+?)["']/g)
        if (matches) {
          queries = matches.map(m => m.replace(/^["']|["']$/g, ''))
        } else {
          // If regex fails, split by newlines and clean up
          queries = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('[') && !line.startsWith(']'))
            .map(line => line.replace(/^["'\d\.\s-]+|["']$/g, ''))
        }
      }
      
      // Ensure we have at least some queries
      if (queries.length === 0) {
        queries = [query]
      }
      
      // Limit to 5 queries
      queries = queries.slice(0, 5)
      
    } catch (parseError) {
      console.error('Error parsing queries:', parseError)
      queries = [query]
    }
    
    console.log(`Generated ${queries.length} search queries`)
    return queries
    
  } catch (error) {
    console.error('Error generating search queries:', error)
    // Return the original query as a fallback
    return [query]
  }
}

// Function to fetch search results for a list of queries
async function fetchSearchResults(queries: string[]) {
  try {
    console.log(`Fetching search results for ${queries.length} queries...`)
    
    // Call the web-scrape function for each query
    const results = []
    
    for (const query of queries) {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/web-scrape`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query })
        })
        
        if (!response.ok) {
          console.error(`Error fetching results for query "${query}": ${response.status}`)
          continue
        }
        
        const data = await response.json()
        
        if (data && Array.isArray(data.results)) {
          results.push(...data.results)
        }
      } catch (queryError) {
        console.error(`Error processing query "${query}":`, queryError)
      }
    }
    
    // Deduplicate results by URL
    const uniqueResults = []
    const seenUrls = new Set()
    
    for (const result of results) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url)
        uniqueResults.push(result)
      }
    }
    
    console.log(`Found ${uniqueResults.length} unique results`)
    return uniqueResults
    
  } catch (error) {
    console.error('Error fetching search results:', error)
    return []
  }
}

async function generateAnalysisWithStreaming(
  openRouterApiKey: string,
  query: string,
  sources: any[],
  previousIterations: any[],
  focusText?: string
) {
  // Build the prompt for the AI
  let systemPrompt = `You are an expert research analyst. Your task is to analyze the provided sources and extract relevant information about the topic.
Provide a comprehensive analysis of the information found in the sources.
Focus on extracting factual information, identifying trends, and highlighting key insights.
Be objective and thorough in your analysis.`

  let userPrompt = `Analyze the following sources to find information about: "${query}"`
  
  if (focusText) {
    systemPrompt += `\nPay special attention to information related to: ${focusText}`
    userPrompt += `\nFocus specifically on: ${focusText}`
  }
  
  // Add previous iterations to the prompt
  if (previousIterations.length > 0) {
    userPrompt += '\n\nPrevious iterations:'
    
    for (const iteration of previousIterations) {
      userPrompt += `\n\nIteration ${iteration.iteration} Analysis:\n${iteration.analysis}`
    }
    
    userPrompt += '\n\nBuild upon the previous analyses and focus on new information from the current sources.'
  }
  
  // Add the sources to the prompt
  userPrompt += '\n\nSources to analyze:'
  
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    userPrompt += `\n\nSOURCE ${i+1}: ${source.url}\n${source.content}`
  }

  try {
    console.log(`Generating analysis for iteration ${currentIteration} with ${sources.length} sources...`)
    
    // Call the OpenRouter API with streaming enabled
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Market Research App'
      },
      body: JSON.stringify({
        model: 'perplexity/llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.1,
        max_tokens: 2000,
        reasoning: {
          exclude: false,
          model: "perplexity/llama-3.1-sonar-small-128k-online"
        }
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }
    
    if (!response.body) {
      throw new Error('No response body from OpenRouter API')
    }

    let analysisText = '';
    let reasoningText = '';
    let analysisBuffer = '';
    let reasoningBuffer = '';
    let bufferCount = 0;
    const updateBufferSize = 1; // MODIFIED: Set to 1 for immediate updates

    const updateDatabase = async () => {
      try {
        if (analysisBuffer) {
          // Use append_iteration_field_text to append only the buffer content
          const { error: analysisError } = await supabaseAdmin.rpc('append_iteration_field_text', {
            job_id: jobId,
            iteration_num: currentIteration,
            field_key: 'analysis',
            append_text: analysisBuffer
          });
          
          if (analysisError) {
            console.error('Error appending to analysis field:', analysisError);
            throw analysisError;
          }
        }
        
        if (reasoningBuffer) {
          // Use append_iteration_field_text to append only the buffer content
          const { error: reasoningError } = await supabaseAdmin.rpc('append_iteration_field_text', {
            job_id: jobId,
            iteration_num: currentIteration,
            field_key: 'reasoning',
            append_text: reasoningBuffer
          });
          
          if (reasoningError) {
            console.error('Error appending to reasoning field:', reasoningError);
            throw reasoningError;
          }
        }
        
        // Clear the buffers after successful update
        analysisBuffer = '';
        reasoningBuffer = '';
        
        console.log(`Updated database for iteration ${currentIteration} (buffer length: analysis=${analysisText.length}, reasoning=${reasoningText.length})`);
      } catch (updateError) {
        console.error('Error updating database:', updateError);
        throw updateError; // Re-throw to propagate the error
      }
    };

    const processStream = async () => {
      const reader = response.body.getReader()
      let decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Final update to ensure all content is saved
            if (analysisBuffer || reasoningBuffer) {
              await updateDatabase();
            }
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const jsonData = JSON.parse(line.substring(6));
                
                // Process reasoning content
                if (jsonData.reasoning?.content) {
                  const reasoningChunk = jsonData.reasoning.content;
                  reasoningText += reasoningChunk;
                  reasoningBuffer += reasoningChunk;
                }
                
                // Process analysis content
                if (jsonData.choices?.[0]?.delta?.content) {
                  const contentChunk = jsonData.choices[0].delta.content;
                  analysisText += contentChunk;
                  analysisBuffer += contentChunk;
                }
                
                // Increment buffer count and update database if threshold reached
                bufferCount++;
                if (bufferCount >= updateBufferSize) {
                  await updateDatabase();
                  bufferCount = 0;
                  
                  // Add memory monitoring log
                  console.log(`Memory monitor - current total lengths: analysis=${analysisText.length}, reasoning=${reasoningText.length}, buffers: analysis=${analysisBuffer.length}, reasoning=${reasoningBuffer.length}`);
                }
              } catch (e) {
                console.error('Error parsing JSON from stream:', e);
              }
            }
          }
        }
        
        return {
          analysis: analysisText,
          reasoning: reasoningText
        };
      } catch (error) {
        console.error('Error in stream processing:', error);
        
        // Final attempt to save any accumulated buffer on error
        if (analysisBuffer || reasoningBuffer) {
          try {
            await updateDatabase();
          } catch (finalUpdateError) {
            console.error('Error in final update attempt:', finalUpdateError);
          }
        }
        
        throw error;
      }
    };

    // Start processing the stream
    const result = await processStream()
    
    console.log(`Analysis generation complete for iteration ${currentIteration}`)
    return result
    
  } catch (error) {
    console.error('Error generating analysis:', error)
    throw error
  }
}

// Function to generate the final analysis
async function generateFinalAnalysisWithStreaming(
  openRouterApiKey: string,
  query: string,
  iterations: any[],
  focusText?: string
) {
  // Build the prompt for the AI
  let systemPrompt = `You are an expert research analyst. Your task is to synthesize the findings from multiple research iterations into a comprehensive final analysis.
Provide a thorough and insightful analysis that integrates all the information gathered across the iterations.
Focus on the most important findings, trends, and insights relevant to the research question.
Be objective, clear, and concise in your analysis.`

  let userPrompt = `Synthesize the findings from the following research iterations into a comprehensive final analysis about: "${query}"`
  
  if (focusText) {
    systemPrompt += `\nPay special attention to information related to: ${focusText}`
    userPrompt += `\nFocus specifically on: ${focusText}`
  }
  
  // Add the iterations to the prompt
  userPrompt += '\n\nResearch iterations:'
  
  for (const iteration of iterations) {
    userPrompt += `\n\nIteration ${iteration.iteration} Analysis:\n${iteration.analysis}`
  }
  
  userPrompt += '\n\nProvide a comprehensive final analysis that synthesizes all the information gathered across these iterations.'

  try {
    console.log('Generating final analysis...')
    
    // Call the OpenRouter API with streaming enabled
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Market Research App'
      },
      body: JSON.stringify({
        model: 'perplexity/llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.1,
        max_tokens: 2000,
        reasoning: {
          exclude: false,
          model: "perplexity/llama-3.1-sonar-small-128k-online"
        }
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }
    
    if (!response.body) {
      throw new Error('No response body from OpenRouter API')
    }

    let analysisText = '';
    let reasoningText = '';
    let analysisBuffer = '';
    let reasoningBuffer = '';
    let bufferCount = 0;
    const updateBufferSize = 1; // MODIFIED: Set to 1 for immediate updates

    const updateDatabase = async () => {
      try {
        // Use append_field to add only the new content
        if (analysisBuffer) {
          // Append the buffer content to the existing results field
          await supabaseAdmin
            .from('research_jobs')
            .update({
              results: supabaseAdmin.rpc('jsonb_deep_set', {
                json: supabase.raw('coalesce(results, \'{}\')'),
                path: '{analysis}',
                value: supabase.raw(`(COALESCE((results->>'analysis')::text, '') || '${analysisBuffer.replace(/'/g, "''")}')`)
              })
            })
            .eq('id', jobId);
        }
        
        // Clear the buffers after successful update
        analysisBuffer = '';
        reasoningBuffer = '';
        
        console.log(`Updated final analysis in database (buffer length: analysis=${analysisText.length}, reasoning=${reasoningText.length})`);
      } catch (updateError) {
        console.error('Error updating final analysis in database:', updateError);
        throw updateError; // Re-throw to propagate the error
      }
    };

    const processStream = async () => {
      const reader = response.body.getReader()
      let decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Final update to ensure all content is saved
            if (analysisBuffer || reasoningBuffer) {
              await updateDatabase();
            }
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const jsonData = JSON.parse(line.substring(6));
                
                // Process reasoning content
                if (jsonData.reasoning?.content) {
                  const reasoningChunk = jsonData.reasoning.content;
                  reasoningText += reasoningChunk;
                  reasoningBuffer += reasoningChunk;
                }
                
                // Process analysis content
                if (jsonData.choices?.[0]?.delta?.content) {
                  const contentChunk = jsonData.choices[0].delta.content;
                  analysisText += contentChunk;
                  analysisBuffer += contentChunk;
                }
                
                // Increment buffer count and update database if threshold reached
                bufferCount++;
                if (bufferCount >= updateBufferSize) {
                  await updateDatabase();
                  bufferCount = 0;
                  
                  // Add memory monitoring log
                  console.log(`Memory monitor - current total lengths: analysis=${analysisText.length}, reasoning=${reasoningText.length}, buffers: analysis=${analysisBuffer.length}, reasoning=${reasoningBuffer.length}`);
                }
              } catch (e) {
                console.error('Error parsing JSON from stream:', e);
              }
            }
          }
        }
        
        return {
          analysis: analysisText,
          reasoning: reasoningText
        };
      } catch (error) {
        console.error('Error in stream processing:', error);
        
        // Final attempt to save any accumulated buffer on error
        if (analysisBuffer || reasoningBuffer) {
          try {
            await updateDatabase();
          } catch (finalUpdateError) {
            console.error('Error in final update attempt:', finalUpdateError);
          }
        }
        
        throw error;
      }
    };

    // Start processing the stream
    const result = await processStream()
    
    console.log('Final analysis generation complete')
    return result
    
  } catch (error) {
    console.error('Error generating final analysis:', error)
    throw error
  }
}

// Function to generate structured insights
async function generateStructuredInsights(
  openRouterApiKey: string,
  query: string,
  finalAnalysis: string,
  focusText?: string
) {
  try {
    console.log('Generating structured insights...')
    
    // Build the prompt for the AI
    let systemPrompt = `You are an expert research analyst. Your task is to extract structured insights from a research analysis.
Provide your response in JSON format with the following structure:
{
  "probability": "X%", // Your assessment of the probability (as a percentage) that the event will occur, based on the research
  "confidence": "high/medium/low", // Your confidence level in this assessment
  "keyFactors": ["factor1", "factor2", ...], // List of key factors influencing your assessment
  "timeframe": "...", // Expected timeframe for the event, if applicable
  "additionalResearch": ["topic1", "topic2", ...] // Suggested areas for additional research
}
Be objective and base your assessment solely on the information provided in the analysis.`

    let userPrompt = `Based on the following research analysis about "${query}", provide structured insights in the requested JSON format.`
    
    if (focusText) {
      userPrompt += `\nFocus specifically on: ${focusText}`
    }
    
    userPrompt += `\n\nResearch Analysis:\n${finalAnalysis}`
    
    // Call the OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Market Research App'
      },
      body: JSON.stringify({
        model: 'perplexity/llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }
    
    const data = await response.json()
    const content = data.choices[0].message.content
    
    // Try to parse the content as JSON
    try {
      // Extract JSON from the content (in case there's additional text)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonStr = jsonMatch[0]
        const insights = JSON.parse(jsonStr)
        console.log('Structured insights generated successfully')
        return insights
      } else {
        console.error('No JSON found in the response')
        return { error: 'Failed to extract structured insights' }
      }
    } catch (parseError) {
      console.error('Error parsing structured insights:', parseError)
      return { error: 'Failed to parse structured insights', rawContent: content }
    }
    
  } catch (error) {
    console.error('Error generating structured insights:', error)
    return { error: error.message }
  }
}

// Function to send a notification email
async function sendNotificationEmail(email: string, jobId: string, query: string) {
  try {
    console.log(`Sending notification email to ${email} for job ${jobId}`)
    
    // Call the send-email function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: email,
        subject: 'Your Research Job is Complete',
        text: `Your research job for "${query}" is now complete. Job ID: ${jobId}. You can view the results by logging into the application.`,
        html: `
          <h1>Your Research Job is Complete</h1>
          <p>Your research job for <strong>"${query}"</strong> is now complete.</p>
          <p>Job ID: <code>${jobId}</code></p>
          <p>You can view the results by logging into the application.</p>
        `
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Send email error: ${response.status} ${errorText}`)
    }
    
    return true
    
  } catch (error) {
    console.error('Error sending notification email:', error)
    throw error
  }
}
