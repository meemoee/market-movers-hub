
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.32.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Missing Supabase credentials' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const { marketId, query, maxIterations = 3, focusText, bestBidPrice, bestAskPrice } = await req.json();
    
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: marketId and query are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Creating research job for market ID ${marketId} with query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);
    console.log(`Focus text: ${focusText || 'None'}`);
    console.log(`Market prices - Best Bid: ${bestBidPrice !== undefined ? bestBidPrice : 'Not provided'}, Best Ask: ${bestAskPrice !== undefined ? bestAskPrice : 'Not provided'}`);
    
    // Get market question from the markets table
    const { data: marketData, error: marketError } = await supabase
      .from('markets')
      .select('question')
      .eq('id', marketId)
      .single();
    
    if (marketError) {
      console.error(`Error fetching market data: ${marketError.message}`);
    }
    
    const marketQuestion = marketData?.question || query;
    
    // Create a new research job
    const { data, error } = await supabase
      .from('research_jobs')
      .insert([
        {
          market_id: marketId,
          query: query,
          status: 'queued',
          max_iterations: maxIterations,
          current_iteration: 0,
          progress_log: ['Job created, waiting to be processed'],
          iterations: [],
          focus_text: focusText || null,
          meta: {
            marketQuestion,
            bestBidPrice: bestBidPrice !== undefined ? bestBidPrice : null,
            bestAskPrice: bestAskPrice !== undefined ? bestAskPrice : null
          }
        }
      ])
      .select()
      .single();
    
    if (error) {
      console.error(`Error creating research job: ${error.message}`);
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to create research job');
    }
    
    console.log(`Created research job with ID: ${data.id}`);
    
    // Start the processing in the background
    const processJob = async () => {
      try {
        // Update job status to processing
        await supabase.functions.invoke('append-research-progress', {
          body: JSON.stringify({ 
            jobId: data.id, 
            progressEntry: 'Starting research process...' 
          })
        });
        
        // Update status to processing
        const { error: updateError } = await supabase.rpc('update_research_job_status', {
          job_id: data.id,
          new_status: 'processing'
        });
        
        if (updateError) {
          console.error(`Error updating job status: ${updateError.message}`);
          throw updateError;
        }
        
        // Generate search queries
        const queriesResponse = await supabase.functions.invoke('generate-queries', {
          body: JSON.stringify({
            description: query,
            marketId,
            marketQuestion,
            focusText
          })
        });
        
        if (queriesResponse.error) {
          throw new Error(`Error generating queries: ${queriesResponse.error.message}`);
        }
        
        const queries = queriesResponse.data?.queries || [];
        
        if (queries.length === 0) {
          throw new Error('No queries generated');
        }
        
        console.log(`Generated ${queries.length} queries`);
        
        // Log the queries
        await supabase.functions.invoke('append-research-progress', {
          body: JSON.stringify({ 
            jobId: data.id, 
            progressEntry: `Generated ${queries.length} search queries` 
          })
        });
        
        // Call the web-scrape function to handle the actual research in the background
        const scrapeResponse = await supabase.functions.invoke('web-scrape', {
          body: JSON.stringify({
            queries,
            marketId,
            focusText
          })
        });
        
        if (scrapeResponse.error) {
          throw new Error(`Error initiating web scrape: ${scrapeResponse.error.message}`);
        }
        
        console.log('Web scraping initiated in background');
        
        await supabase.functions.invoke('append-research-progress', {
          body: JSON.stringify({ 
            jobId: data.id, 
            progressEntry: 'Web research started in background...' 
          })
        });
        
        // Start the iteration process
        for (let i = 1; i <= maxIterations; i++) {
          console.log(`Starting iteration ${i}/${maxIterations}`);
          
          // Update current iteration
          await supabase
            .from('research_jobs')
            .update({ current_iteration: i })
            .eq('id', data.id);
          
          // Get the current state of the research
          const { data: jobData, error: jobError } = await supabase
            .from('research_jobs')
            .select('*')
            .eq('id', data.id)
            .single();
          
          if (jobError || !jobData) {
            console.error(`Error fetching job data: ${jobError?.message || 'Not found'}`);
            continue;
          }
          
          // Collect all previous iterations' analyses
          const previousAnalyses = (jobData.iterations || [])
            .filter((it: any) => it.analysis)
            .map((it: any) => it.analysis);
          
          await supabase.functions.invoke('append-research-progress', {
            body: JSON.stringify({ 
              jobId: data.id, 
              progressEntry: `Starting iteration ${i}/${maxIterations}...` 
            })
          });
          
          // Run Web search to collect content
          await supabase.functions.invoke('append-research-progress', {
            body: JSON.stringify({ 
              jobId: data.id, 
              progressEntry: `Collecting web content...` 
            })
          });
          
          // Wait for the web scraping to complete
          // Simulating the wait time with a delay
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Get the latest content results from previous steps
          const webContent = [];
          
          try {
            // Call analyze-web-content function
            await supabase.functions.invoke('append-research-progress', {
              body: JSON.stringify({ 
                jobId: data.id, 
                progressEntry: `Analyzing the collected web content...` 
              })
            });
            
            // Extract just the content from each result to pass to the analyze function
            const { data: resultData } = await supabase
              .from('research_jobs')
              .select('results')
              .eq('id', data.id)
              .single();
            
            if (resultData && resultData.results) {
              try {
                const parsedResults = JSON.parse(resultData.results);
                if (parsedResults.data && Array.isArray(parsedResults.data)) {
                  const contents = parsedResults.data.map((item: any) => item.content).join('\n\n');
                  webContent.push(contents);
                }
              } catch (e) {
                console.error('Error parsing results:', e);
              }
            }
            
            if (webContent.length === 0) {
              webContent.push('No content collected yet');
            }
            
            // Retrieve the bid/ask prices from the job meta
            const bestBidPrice = jobData.meta?.bestBidPrice || null;
            const bestAskPrice = jobData.meta?.bestAskPrice || null;
            
            // Analyze the web content
            const analyzeResponse = await supabase.functions.invoke('analyze-web-content', {
              body: JSON.stringify({
                webContent: webContent.join('\n\n'),
                marketId,
                query,
                focusText,
                previousAnalyses,
                iterationNumber: i,
                areasForResearch: (jobData.iterations || [])
                  .filter((it: any) => it.areas_for_research)
                  .flatMap((it: any) => it.areas_for_research)
              })
            });
            
            if (analyzeResponse.error) {
              throw new Error(`Error analyzing web content: ${analyzeResponse.error.message}`);
            }
            
            const analysis = analyzeResponse.data?.analysis || 'No analysis available';
            const areasForResearch = analyzeResponse.data?.areasForResearch || [];
            
            // Add to iterations
            const iteration = {
              iteration: i,
              timestamp: new Date().toISOString(),
              analysis: analysis,
              areas_for_research: areasForResearch
            };
            
            await supabase.rpc('append_research_iteration', {
              job_id: data.id,
              iteration_data: JSON.stringify([iteration])
            });
            
            // Generate structured insights from the analysis
            await supabase.functions.invoke('append-research-progress', {
              body: JSON.stringify({ 
                jobId: data.id, 
                progressEntry: `Generating structured insights...` 
              })
            });
            
            const insightsResponse = await supabase.functions.invoke('extract-research-insights', {
              body: JSON.stringify({
                webContent: webContent.join('\n\n'),
                analysis,
                marketId,
                marketQuestion,
                previousAnalyses,
                iterations: jobData.iterations || [],
                queries,
                areasForResearch,
                focusText: jobData.focus_text || null,
                bestBidPrice,
                bestAskPrice
              })
            });
            
            if (insightsResponse.error) {
              console.error(`Error extracting insights: ${insightsResponse.error.message}`);
            } else {
              console.log('Generated structured insights');
              
              // Update the results with the insights
              const updatedResults = {
                data: parsedResults?.data || [],
                analysis,
                structuredInsights: insightsResponse.data,
                bestBidPrice,
                bestAskPrice
              };
              
              await supabase.rpc('update_research_results', {
                job_id: data.id,
                result_data: JSON.stringify(updatedResults)
              });
            }
            
            await supabase.functions.invoke('append-research-progress', {
              body: JSON.stringify({ 
                jobId: data.id, 
                progressEntry: `Completed iteration ${i}/${maxIterations}` 
              })
            });
            
          } catch (error) {
            console.error(`Error in iteration ${i}:`, error);
            await supabase.functions.invoke('append-research-progress', {
              body: JSON.stringify({ 
                jobId: data.id, 
                progressEntry: `Error in iteration ${i}: ${error instanceof Error ? error.message : 'Unknown error'}` 
              })
            });
          }
          
          // Check if the job has been cancelled or marked as completed
          const { data: currentJobData } = await supabase
            .from('research_jobs')
            .select('status')
            .eq('id', data.id)
            .single();
          
          if (currentJobData && (currentJobData.status === 'completed' || currentJobData.status === 'failed')) {
            console.log(`Job ${data.id} was manually marked as ${currentJobData.status}, stopping iterations`);
            break;
          }
          
          // Wait a short time between iterations
          if (i < maxIterations) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Mark the job as completed
        await supabase.rpc('update_research_job_status', {
          job_id: data.id,
          new_status: 'completed'
        });
        
        await supabase.functions.invoke('append-research-progress', {
          body: JSON.stringify({ 
            jobId: data.id, 
            progressEntry: 'Research job completed successfully' 
          })
        });
        
        console.log(`Research job ${data.id} completed`);
        
      } catch (error) {
        console.error('Error in background job processing:', error);
        
        // Mark the job as failed
        await supabase.rpc('update_research_job_status', {
          job_id: data.id,
          new_status: 'failed',
          error_msg: error instanceof Error ? error.message : 'Unknown error'
        });
        
        await supabase.functions.invoke('append-research-progress', {
          body: JSON.stringify({ 
            jobId: data.id, 
            progressEntry: `Job failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
          })
        });
      }
    };
    
    // Start the job processing in the background
    // @ts-ignore: EdgeRuntime is available in Deno Deploy environment
    EdgeRuntime.waitUntil(processJob());
    
    return new Response(
      JSON.stringify({ 
        jobId: data.id,
        message: 'Research job created successfully and processing started'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in create-research-job:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
