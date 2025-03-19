import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from "https://esm.sh/openai@4.0.0"
import { corsHeaders } from "../_shared/cors.ts"

// Enhanced CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// SSE specific headers
const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to write SSE messages
function writeSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

// Main serve function
serve(async (req) => {
  console.log(`Request received: ${req.method} ${new URL(req.url).pathname}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }
  
  const url = new URL(req.url);
  console.log(`Request URL: ${url.toString()}`);
  
  // Check for SSE request - these come as GET requests with specific parameters
  const jobId = url.searchParams.get('jobId');
  const streamAnalysis = url.searchParams.get('streamAnalysis') === 'true';
  
  if (req.method === 'GET' && jobId && streamAnalysis) {
    console.log(`SSE stream request for job ${jobId}`);
    
    // For SSE endpoints, we accept the API key in the URL parameters
    const apiKey = url.searchParams.get('apikey');
    
    if (!apiKey) {
      console.error('No API key provided for SSE stream');
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('API key found in URL parameters, setting up SSE stream');
    
    // Create an SSE stream
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection confirmation
        console.log('Starting SSE stream, sending connection event');
        writeSSE(controller, 'connected', { 
          message: 'SSE connection established', 
          jobId 
        });
        
        // Send a test message 
        setTimeout(() => {
          console.log('Sending test message in SSE stream');
          writeSSE(controller, 'test', {
            message: 'Test message from server',
            timestamp: new Date().toISOString(),
            jobId
          });
        }, 2000);
        
        // Keep connection alive with a heartbeat
        const heartbeatInterval = setInterval(() => {
          writeSSE(controller, 'heartbeat', { timestamp: new Date().toISOString() });
        }, 30000);
        
        // Clean up on close
        req.signal.addEventListener('abort', () => {
          console.log('SSE connection aborted');
          clearInterval(heartbeatInterval);
        });
      }
    });
    
    return new Response(stream, { headers: sseHeaders });
  }
  
  // For regular POST requests (job creation)
  if (req.method === 'POST') {
    try {
      // Check API key in headers for regular requests
      const authHeader = req.headers.get('Authorization');
      const apiKeyHeader = req.headers.get('apikey');
      
      if (!authHeader && !apiKeyHeader) {
        console.error('No authorization headers found in POST request');
        return new Response(
          JSON.stringify({ error: 'API key is required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Continue with regular job creation
      const requestData = await req.json();
      
      const { marketId, query, maxIterations = 3, focusText, notificationEmail, streamAnalysis = false } = requestData;
      
      if (!marketId || !query) {
        return new Response(
          JSON.stringify({ error: 'Market ID and query are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      
      console.log(`Creating research job for market ${marketId} with ${maxIterations} iterations`);
      console.log(`Focus text: ${focusText || 'None'}`);
      console.log(`Notification email: ${notificationEmail || 'None'}`);
      console.log(`Stream analysis: ${streamAnalysis}`);
      
      // Create Supabase client
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      );
      
      // Create a new job record
      const { data: jobData, error: jobError } = await supabaseAdmin
        .from('research_jobs')
        .insert({
          market_id: marketId,
          query: query,
          status: 'queued',
          max_iterations: maxIterations,
          current_iteration: 0,
          progress_log: ['Job created, waiting to start...'],
          focus_text: focusText || null,
          notification_email: notificationEmail || null,
          notification_sent: false
        })
        .select('id')
        .single();
      
      if (jobError) {
        console.error('Error creating job record:', jobError);
        throw new Error(`Failed to create job record: ${jobError.message}`);
      }
      
      const jobId = jobData.id;
      console.log(`Created job with ID: ${jobId}`);
      
      // Start the research process in the background
      const performWebResearch = async () => {
        try {
          console.log(`Starting background research for job ${jobId}`);
          
          // Update job status to processing
          await supabaseAdmin
            .from('research_jobs')
            .update({
              status: 'processing',
              started_at: new Date().toISOString(),
              progress_log: ['Job started processing...', `Processing market ID: ${marketId}`]
            })
            .eq('id', jobId);
          
          // Initialize OpenAI client
          const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY') || '',
          });
          
          // Perform the research iterations
          let currentIteration = 0;
          let allResults = [];
          let iterations = [];
          let finalAnalysis = '';
          
          while (currentIteration < maxIterations) {
            currentIteration++;
            console.log(`Starting iteration ${currentIteration} of ${maxIterations}`);
            
            // Update progress
            await supabaseAdmin
              .from('research_jobs')
              .update({
                current_iteration: currentIteration,
                progress_log: supabaseAdmin.rpc('append_to_array', {
                  arr: ['progress_log'],
                  val: `Starting iteration ${currentIteration} of ${maxIterations}...`
                })
              })
              .eq('id', jobId);
            
            // Generate search queries
            console.log(`Generating queries for iteration ${currentIteration}`);
            const queryPayload = {
              query: query,
              marketId: marketId,
              marketDescription: query,
              question: query,
              iteration: currentIteration,
              focusText: focusText || null
            };
            
            const { data: queriesData, error: queriesError } = await supabaseAdmin.functions.invoke('generate-queries', {
              body: JSON.stringify(queryPayload)
            });
            
            if (queriesError) {
              console.error(`Error generating queries for iteration ${currentIteration}:`, queriesError);
              throw new Error(`Failed to generate queries: ${queriesError.message}`);
            }
            
            if (!queriesData?.queries || !Array.isArray(queriesData.queries)) {
              console.error(`Invalid queries response for iteration ${currentIteration}:`, queriesData);
              throw new Error('Invalid queries response');
            }
            
            const queries = queriesData.queries;
            console.log(`Generated ${queries.length} queries for iteration ${currentIteration}`);
            
            // Update progress
            await supabaseAdmin
              .from('research_jobs')
              .update({
                progress_log: supabaseAdmin.rpc('append_to_array', {
                  arr: ['progress_log'],
                  val: `Generated ${queries.length} search queries for iteration ${currentIteration}`
                })
              })
              .eq('id', jobId);
            
            // Perform web scraping
            console.log(`Performing web scraping for iteration ${currentIteration}`);
            const scrapePayload = {
              queries: queries,
              marketId: marketId,
              marketDescription: query,
              query: query,
              focusText: focusText || null
            };
            
            const { data: scrapeData, error: scrapeError } = await supabaseAdmin.functions.invoke('web-scrape', {
              body: JSON.stringify(scrapePayload)
            });
            
            if (scrapeError) {
              console.error(`Error in web scraping for iteration ${currentIteration}:`, scrapeError);
              throw new Error(`Failed to perform web scraping: ${scrapeError.message}`);
            }
            
            // Process scrape results
            console.log(`Processing scrape results for iteration ${currentIteration}`);
            
            // Update progress
            await supabaseAdmin
              .from('research_jobs')
              .update({
                progress_log: supabaseAdmin.rpc('append_to_array', {
                  arr: ['progress_log'],
                  val: `Completed web search for iteration ${currentIteration}, analyzing results...`
                })
              })
              .eq('id', jobId);
            
            // Analyze content
            console.log(`Analyzing content for iteration ${currentIteration}`);
            
            // Simulate content analysis with streaming
            let iterationAnalysis = '';
            
            // Create a streaming completion
            const completion = await openai.chat.completions.create({
              model: "gpt-4-turbo",
              messages: [
                {
                  role: "system",
                  content: "You are analyzing web search results for a prediction market question."
                },
                {
                  role: "user",
                  content: `Analyze the following search results for the question: ${query}. Iteration ${currentIteration}/${maxIterations}.`
                }
              ],
              stream: true,
              temperature: 0.7,
            });
            
            // Process the streaming response
            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                iterationAnalysis += content;
                
                // In a real implementation, you would send this to the client via SSE
                console.log(`Streaming analysis chunk for iteration ${currentIteration}`);
              }
            }
            
            console.log(`Completed analysis for iteration ${currentIteration}`);
            
            // Store iteration results
            iterations.push({
              iteration: currentIteration,
              queries: queries,
              results: [], // In a real implementation, this would contain the actual results
              analysis: iterationAnalysis
            });
            
            // Update job with iteration results
            await supabaseAdmin
              .from('research_jobs')
              .update({
                iterations: iterations,
                progress_log: supabaseAdmin.rpc('append_to_array', {
                  arr: ['progress_log'],
                  val: `Completed analysis for iteration ${currentIteration}`
                })
              })
              .eq('id', jobId);
            
            // If this is the final iteration, perform final analysis
            if (currentIteration === maxIterations) {
              console.log('Performing final analysis');
              
              // Update progress
              await supabaseAdmin
                .from('research_jobs')
                .update({
                  progress_log: supabaseAdmin.rpc('append_to_array', {
                    arr: ['progress_log'],
                    val: 'Performing final analysis and extracting insights...'
                  })
                })
                .eq('id', jobId);
              
              // Create a streaming completion for final analysis
              const finalCompletion = await openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                  {
                    role: "system",
                    content: "You are providing a final analysis of research results for a prediction market question."
                  },
                  {
                    role: "user",
                    content: `Provide a final analysis for the question: ${query}. Consider all iterations of research.`
                  }
                ],
                stream: true,
                temperature: 0.7,
              });
              
              // Process the streaming response
              for await (const chunk of finalCompletion) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                  finalAnalysis += content;
                  
                  // In a real implementation, you would send this to the client via SSE
                  console.log('Streaming final analysis chunk');
                }
              }
              
              console.log('Final analysis complete');
              
              // Extract structured insights
              console.log('Extracting structured insights');
              
              const structuredInsights = {
                probability: "65%", // This would be extracted from the analysis
                areasForResearch: [
                  "Economic indicators",
                  "Political developments",
                  "Industry trends"
                ],
                reasoning: "Based on the collected evidence and expert opinions..."
              };
              
              // Prepare final results
              const finalResults = {
                data: allResults,
                analysis: finalAnalysis,
                structuredInsights: structuredInsights
              };
              
              // Update job with final results
              await supabaseAdmin
                .from('research_jobs')
                .update({
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  results: JSON.stringify(finalResults),
                  progress_log: supabaseAdmin.rpc('append_to_array', {
                    arr: ['progress_log'],
                    val: 'Research job completed successfully!'
                  })
                })
                .eq('id', jobId);
              
              // Send notification email if requested
              if (notificationEmail) {
                console.log(`Sending notification email to ${notificationEmail}`);
                
                // In a real implementation, you would send an actual email
                console.log('Email notification would be sent here');
                
                // Mark notification as sent
                await supabaseAdmin
                  .from('research_jobs')
                  .update({
                    notification_sent: true
                  })
                  .eq('id', jobId);
              }
            }
          }
          
          console.log(`Research job ${jobId} completed successfully`);
          
        } catch (error) {
          console.error(`Error in background research for job ${jobId}:`, error);
          
          // Update job status to failed
          await supabaseAdmin
            .from('research_jobs')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : 'Unknown error',
              progress_log: supabaseAdmin.rpc('append_to_array', {
                arr: ['progress_log'],
                val: `Job failed: ${error instanceof Error ? error.message : 'Unknown error'}`
              })
            })
            .eq('id', jobId);
          
          // Send failure notification if email was provided
          if (notificationEmail) {
            console.log(`Sending failure notification email to ${notificationEmail}`);
            
            // In a real implementation, you would send an actual email
            console.log('Failure email notification would be sent here');
            
            // Mark notification as sent
            await supabaseAdmin
              .from('research_jobs')
              .update({
                notification_sent: true
              })
              .eq('id', jobId);
          }
        }
      };
      
      // Start the research process in the background
      // @ts-ignore - EdgeRuntime is available in Deno Deploy
      EdgeRuntime.waitUntil(performWebResearch());
      
      // Return immediate response with job ID
      return new Response(
        JSON.stringify({ 
          jobId, 
          message: "Research job created and started in background" 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202 // Accepted
        }
      );
      
    } catch (error) {
      console.error(`Error in create-research-job:`, error);
      return new Response(
        JSON.stringify({ 
          error: 'Error processing research job request',
          details: error instanceof Error ? error.message : 'Unknown error'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }
  
  // If we reach here, it's an unsupported request method
  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
