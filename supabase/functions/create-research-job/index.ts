
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.23.0";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: user } = await supabase.auth.getUser();
    
    if (!user.user) {
      throw new Error('Not authenticated');
    }

    const { marketId, marketQuestion, marketDescription } = await req.json();
    
    if (!marketId || !marketQuestion) {
      throw new Error('Market ID and question are required');
    }

    console.log(`Creating research job for market: ${marketId}, question: ${marketQuestion}`);
    
    // Step 1: Create the research job in the database
    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .insert({
        user_id: user.user.id,
        market_id: marketId,
        question: marketQuestion,
        description: marketDescription || null,
        status: 'pending',
        max_iterations: 3,
        current_iteration: 0,
        progress_log: [],
        iterations: [],
        results: {}
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating research job:', jobError);
      throw jobError;
    }

    console.log(`Research job created with ID: ${job.id}`);

    // Step 2: Generate search queries based on the market question
    const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
      body: { 
        marketQuestion, 
        marketDescription
      }
    });

    if (queriesError || !queriesData) {
      console.error('Error generating queries:', queriesError);
      
      // Update job status to failed
      await supabase.functions.invoke('update-research-job-status', {
        body: { 
          jobId: job.id, 
          status: 'failed',
          errorMessage: 'Failed to generate search queries'
        }
      });
      
      throw new Error('Failed to generate search queries');
    }

    console.log(`Generated queries: ${JSON.stringify(queriesData)}`);

    // Update job status to processing
    await supabase.rpc('update_research_job_status', {
      job_id: job.id,
      new_status: 'processing'
    });

    // Step 3: Perform web search for each query
    await supabase.rpc('append_research_progress', {
      job_id: job.id,
      progress_entry: "Searching the web for relevant information..."
    });

    try {
      // Call web-scrape function with array of queries
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('web-scrape', {
        body: { 
          queries: queriesData.queries
        }
      });
      
      if (scrapeError) {
        console.error('Error in web scrape:', scrapeError);
        throw scrapeError;
      }

      console.log(`Web scrape completed, found ${scrapeData.results.length} results`);
      
      // Step 4: Perform research analysis with the web content
      await supabase.rpc('append_research_progress', {
        job_id: job.id,
        progress_entry: "Analyzing search results..."
      });
      
      // Stream analysis to create a better UX
      console.log("Starting analysis streaming");
      
      const analysisResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app', 
          'X-Title': 'HunchEx',
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat",
          messages: [
            {
              role: "system",
              content: `You are a research assistant analyzing data related to prediction markets.
              You will be given a question and web search results.
              Your task is to analyze the information and provide:
              1. A comprehensive analysis of the available information
              2. A probability assessment (0-100%) based on the evidence
              3. Areas that require more research
              
              Be factual, cite your sources when making claims, and explain any uncertainty.`
            },
            {
              role: "user",
              content: `Question: ${marketQuestion}
              ${marketDescription ? `Context: ${marketDescription}` : ''}
              
              Web search results:
              ${scrapeData.results.map((r: any, i: number) => 
                `Source ${i+1}: ${r.title} (${r.url})
                ${r.content}`
              ).join('\n\n')}`
            }
          ],
          stream: true
        })
      });
      
      if (!analysisResponse.ok) {
        const errorText = await analysisResponse.text();
        throw new Error(`Analysis request failed: ${analysisResponse.status} - ${errorText}`);
      }
      
      const reader = analysisResponse.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get stream reader');
      }
      
      let analysis = '';
      let reasoning = '';
      let isCompleted = false;
      let lastChunkTime = Date.now();
      let inactivityTimeout = 10000; // 10 seconds inactivity timeout
      let chunkCount = 0;
      
      // Improved stream handling
      const processStream = async () => {
        try {
          while (!isCompleted) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log("Stream marked as done");
              isCompleted = true;
              break;
            }
            
            lastChunkTime = Date.now();
            const chunk = new TextDecoder().decode(value);
            chunkCount++;
            
            console.log(`Received chunk #${chunkCount}: ${chunk.length} bytes`);
            
            // Process each line in the chunk
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              
              if (line.includes('[DONE]')) {
                console.log("Found [DONE] marker in stream");
                isCompleted = true;
                break;
              }
              
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                
                // Skip "[DONE]" message
                if (jsonStr === '[DONE]') {
                  console.log("Found [DONE] data message");
                  isCompleted = true;
                  break;
                }
                
                try {
                  const data = JSON.parse(jsonStr);
                  
                  // Check for completion flag
                  if (data.done === true) {
                    console.log("Found done:true flag in data");
                    isCompleted = true;
                    break;
                  }
                  
                  // Handle different possible response structures
                  const delta = data.choices?.[0]?.delta;
                  const message = data.choices?.[0]?.message;
                  
                  // Extract content from delta or message
                  const content = delta?.content || message?.content || '';
                  if (content) {
                    analysis += content;
                    console.log(`Added ${content.length} chars to analysis, total: ${analysis.length}`);
                  }
                  
                  // Handle possible reasoning field in delta or message
                  const deltaReasoning = delta?.reasoning || message?.reasoning || '';
                  if (deltaReasoning) {
                    reasoning += deltaReasoning;
                    console.log(`Added ${deltaReasoning.length} chars to reasoning, total: ${reasoning.length}`);
                  }
                  
                  // Store intermediate results every 5 chunks
                  if (chunkCount % 5 === 0) {
                    await supabase.rpc('update_research_results', {
                      job_id: job.id,
                      result_data: {
                        analysis,
                        reasoning,
                        sources: scrapeData.results.map((r: any) => r.url),
                        is_streaming: true
                      }
                    });
                    console.log(`Saved intermediate results at chunk #${chunkCount}`);
                  }
                } catch (e) {
                  // Parsing errors are expected during streaming, just log and continue
                  console.log(`JSON parse error in chunk (likely partial): ${e.message}`);
                }
              }
            }
            
            // Check for inactivity timeout
            if (Date.now() - lastChunkTime > inactivityTimeout) {
              console.log(`Stream inactivity timeout after ${inactivityTimeout}ms`);
              isCompleted = true;
              break;
            }
          }
          
          // Final save after stream completes
          console.log("Stream processing completed, saving final results");
          await supabase.rpc('update_research_results', {
            job_id: job.id,
            result_data: {
              analysis,
              reasoning,
              sources: scrapeData.results.map((r: any) => r.url),
              is_streaming: false
            }
          });
          
          // Extract key insights
          console.log("Extracting insights from analysis");
          const { data: insightsData, error: insightsError } = await supabase.functions.invoke('extract-research-insights', {
            body: { 
              jobId: job.id,
              analysis
            }
          });
          
          if (insightsError) {
            console.error('Error extracting insights:', insightsError);
            throw insightsError;
          }
          
          const { probability, areasForResearch } = insightsData;
          
          // Step 5: Save the complete results
          await supabase.rpc('update_research_results', {
            job_id: job.id,
            result_data: {
              analysis,
              reasoning,
              sources: scrapeData.results.map((r: any) => r.url),
              probability,
              areas_for_research: areasForResearch,
              is_streaming: false
            }
          });
          
          // Mark job as completed
          await supabase.rpc('update_research_job_status', {
            job_id: job.id,
            new_status: 'completed'
          });
          
          console.log(`Research job ${job.id} completed successfully`);
          
        } catch (error) {
          console.error("Error in stream processing:", error);
          throw error;
        }
      };
      
      // Start processing in background
      processStream().catch(error => {
        console.error("Background stream processing error:", error);
      });
      
      // Return immediately with the job ID
      return new Response(
        JSON.stringify({ 
          jobId: job.id, 
          message: 'Research job created and processing started'
        }),
        { 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
      
    } catch (error) {
      console.error('Error in research process:', error);
      
      // Update job status to failed
      await supabase.rpc('update_research_job_status', {
        job_id: job.id,
        new_status: 'failed',
        error_msg: error.message || 'An unknown error occurred'
      });
      
      throw error;
    }
    
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
});
