
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to perform web research
async function performWebResearch(jobId: string, query: string, marketId: string, maxIterations: number) {
  console.log(`Starting background research for job ${jobId}`)
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Update job status to processing
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'processing'
    })
    
    // Log start
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Starting research for: ${query}`)
    })
    
    // Track all previous queries to avoid repetition
    const previousQueries: string[] = [];
    // Track all seen URLs to avoid duplicate content
    const seenUrls = new Set<string>();
    // Track previous analyses to inform future iterations
    const previousAnalyses: string[] = [];
    
    // Simulate iterations
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Processing iteration ${i} for job ${jobId}`)
      
      // Update current iteration
      await supabaseClient
        .from('research_jobs')
        .update({ current_iteration: i })
        .eq('id', jobId)
      
      // Add progress log for this iteration
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Starting iteration ${i} of ${maxIterations}`)
      })
      
      // Generate search queries
      try {
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Generating search queries for iteration ${i}`)
        })
        
        // Call the generate-queries function to get real queries
        const generateQueriesResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              query,
              marketId,
              iteration: i,
              previousQueries,
              previousAnalyses  // Pass previous analyses to inform query generation
            })
          }
        );
        
        if (!generateQueriesResponse.ok) {
          throw new Error(`Failed to generate queries: ${generateQueriesResponse.statusText}`);
        }
        
        const { queries } = await generateQueriesResponse.json();
        console.log(`Generated ${queries.length} queries for iteration ${i}:`, queries);
        
        // Add generated queries to previous queries to avoid repetition
        previousQueries.push(...queries);
        
        // Store the queries in the iteration data
        const iterationData = {
          iteration: i,
          queries: queries,
          results: [],
          analysis: ""  // Initialize with empty analysis
        };
        
        // Append the iteration data to the research job
        await supabaseClient.rpc('append_research_iteration', {
          job_id: jobId,
          iteration_data: iterationData
        });
        
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Generated ${queries.length} search queries for iteration ${i}`)
        })
        
        // Process each query with Brave Search
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Executing Brave searches for iteration ${i}...`)
        });
        
        let allResults = [];
        
        // Process each query sequentially
        for (let j = 0; j < queries.length; j++) {
          const currentQuery = queries[j];
          
          try {
            // Call the brave-search function
            const braveSearchResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/brave-search`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                  query: currentQuery,
                  count: 10 // Get 10 results per query
                })
              }
            );
            
            if (!braveSearchResponse.ok) {
              console.error(`Error searching for query "${currentQuery}": ${braveSearchResponse.statusText}`);
              continue;
            }
            
            const searchResults = await braveSearchResponse.json();
            
            // Extract web results
            const webResults = searchResults.web?.results || [];
            
            // Log search results count
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Found ${webResults.length} results for "${currentQuery}"`)
            });
            
            // Process results: fetch content from URLs
            const validResults = [];
            
            for (const result of webResults) {
              // Skip if we've seen this URL before
              if (seenUrls.has(result.url)) continue;
              
              try {
                // Add to seen URLs set
                seenUrls.add(result.url);
                
                // Simplified content extraction
                const processedResult = {
                  url: result.url,
                  title: result.title || '',
                  content: result.description || '',
                  source: 'brave_search'
                };
                
                validResults.push(processedResult);
                allResults.push(processedResult);
              } catch (fetchError) {
                console.error(`Error processing result URL ${result.url}:`, fetchError);
              }
            }
            
            // Update the iteration with these results
            const currentIterationData = (await supabaseClient
              .from('research_jobs')
              .select('iterations')
              .eq('id', jobId)
              .single()).data?.iterations || [];
            
            // Find the current iteration
            for (let k = 0; k < currentIterationData.length; k++) {
              if (currentIterationData[k].iteration === i) {
                // Add these results to the existing results
                const updatedIterationData = [...currentIterationData];
                const currentResults = updatedIterationData[k].results || [];
                updatedIterationData[k].results = [...currentResults, ...validResults];
                
                // Update the database
                await supabaseClient
                  .from('research_jobs')
                  .update({ iterations: updatedIterationData })
                  .eq('id', jobId);
                
                break;
              }
            }
            
          } catch (queryError) {
            console.error(`Error processing query "${currentQuery}":`, queryError);
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Error processing query "${currentQuery}": ${queryError.message}`)
            });
          }
        }
        
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Completed searches for iteration ${i} with ${allResults.length} total results`)
        });
        
        // NEW: Analyze the results of this iteration
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Analyzing results for iteration ${i}...`)
        });
        
        // Get all results collected so far for this iteration
        const { data: currentJob } = await supabaseClient
          .from('research_jobs')
          .select('iterations')
          .eq('id', jobId)
          .single();
          
        const iterationResults = currentJob?.iterations?.find((iter: any) => iter.iteration === i)?.results || [];
        
        if (iterationResults.length > 0) {
          try {
            // Combine all content from this iteration
            const combinedContent = iterationResults
              .map((result: any) => `URL: ${result.url}\nTitle: ${result.title}\nContent: ${result.content}`)
              .join('\n\n');
            
            // Call extract-research-insights with the combined content
            const analyzeResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                  webContent: combinedContent,
                  analysis: "",
                  marketId,
                  marketQuestion: query,
                  previousAnalyses
                })
              }
            );
            
            if (!analyzeResponse.ok) {
              throw new Error(`Failed to analyze results: ${analyzeResponse.statusText}`);
            }
            
            // Use direct JSON response instead of trying to read stream
            const analyzeData = await analyzeResponse.json();
            // Extract the analysis text (field depends on extract-research-insights structure)
            const analysisText = analyzeData.text || analyzeData.analysis || JSON.stringify(analyzeData);
            
            console.log(`Got analysis text for iteration ${i}:`, analysisText.substring(0, 100) + '...');
            
            // Add analysis to previous analyses array for next iteration
            previousAnalyses.push(analysisText);
            
            // Update the iteration with the analysis
            const updatedIterationData = currentJob.iterations.map((iter: any) => {
              if (iter.iteration === i) {
                return {
                  ...iter,
                  analysis: analysisText
                };
              }
              return iter;
            });
            
            // Log the updated iteration data to verify analysis is included
            console.log(`Updated iteration ${i} with analysis of length: ${analysisText.length}`);
            console.log(`First 100 chars of analysis: ${analysisText.substring(0, 100)}`);
            
            // Update the database with the analysis
            const { error: updateError } = await supabaseClient
              .from('research_jobs')
              .update({ iterations: updatedIterationData })
              .eq('id', jobId);
              
            if (updateError) {
              console.error(`Error updating iteration ${i} with analysis:`, updateError);
              throw new Error(`Failed to update iteration with analysis: ${updateError.message}`);
            }
            
            // Verify the update was successful
            const { data: verifyData, error: verifyError } = await supabaseClient
              .from('research_jobs')
              .select('iterations')
              .eq('id', jobId)
              .single();
              
            if (verifyError) {
              console.error(`Error verifying iteration ${i} update:`, verifyError);
            } else {
              const verifiedIteration = verifyData.iterations.find((iter: any) => iter.iteration === i);
              if (verifiedIteration) {
                console.log(`Verified iteration ${i} analysis length: ${verifiedIteration.analysis ? verifiedIteration.analysis.length : 0}`);
              }
            }
              
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Completed analysis for iteration ${i}`)
            });
            
          } catch (analysisError) {
            console.error(`Error analyzing results for iteration ${i}:`, analysisError);
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Error analyzing results: ${analysisError.message}`)
            });
          }
        } else {
          await supabaseClient.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: JSON.stringify(`No results to analyze for iteration ${i}`)
          });
        }
        
      } catch (error) {
        console.error(`Error generating queries for job ${jobId}:`, error);
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Error generating queries: ${error.message}`)
        });
      }
    }
    
    // Get all results from all iterations
    const { data: jobData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
    
    const allIterations = jobData?.iterations || [];
    
    // Collect all results from all iterations
    const allResults = [];
    for (const iteration of allIterations) {
      if (iteration.results && Array.isArray(iteration.results)) {
        allResults.push(...iteration.results);
      }
    }
    
    // Ensure we have analyses from all iterations
    const iterationAnalyses = allIterations
      .filter(iteration => iteration.analysis && iteration.analysis.length > 0)
      .map(iteration => iteration.analysis);
    
    console.log(`Collected ${iterationAnalyses.length} iteration analyses for final results`);
    
    // Log all iterations to debug analysis
    console.log(`All iterations analysis check:`);
    allIterations.forEach((iter: any, index: number) => {
      console.log(`Iteration ${iter.iteration} analysis length: ${iter.analysis ? iter.analysis.length : 0}`);
      if (iter.analysis) {
        console.log(`Iteration ${iter.iteration} analysis preview: ${iter.analysis.substring(0, 50)}...`);
      }
    });
    
    // Create final results object
    const finalResults = {
      data: allResults,
      analysis: `Based on ${allResults.length} search results across ${maxIterations} iterations, we found information related to "${query}".`,
      iterationAnalyses: iterationAnalyses.length > 0 ? iterationAnalyses : previousAnalyses  // Ensure we have iteration analyses
    };
    
    console.log(`Final results contain ${finalResults.iterationAnalyses.length} iteration analyses`);
    
    // Update the job with results
    await supabaseClient.rpc('update_research_results', {
      job_id: jobId,
      result_data: JSON.stringify(finalResults)
    });
    
    // Mark job as complete
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'completed'
    });
    
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify('Research completed successfully!')
    });
    
    console.log(`Completed background research for job ${jobId}`);
  } catch (error) {
    console.error(`Error in background job ${jobId}:`, error);
    
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Mark job as failed
      await supabaseClient.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed',
        error_msg: error.message || 'Unknown error'
      });
      
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Research failed: ${error.message || 'Unknown error'}`)
      });
    } catch (e) {
      console.error(`Failed to update job ${jobId} status:`, e);
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { marketId, query, maxIterations = 3 } = await req.json()
    
    if (!marketId || !query) {
      return new Response(
        JSON.stringify({ error: 'marketId and query are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Create a new job record
    const { data: jobData, error: jobError } = await supabaseClient
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        max_iterations: maxIterations,
        current_iteration: 0,
        progress_log: [],
        iterations: []
      })
      .select('id')
      .single()
    
    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`)
    }
    
    const jobId = jobData.id
    
    // Start the background process without EdgeRuntime
    // Use standard Deno setTimeout for async operation instead
    setTimeout(() => {
      performWebResearch(jobId, query, marketId, maxIterations).catch(err => {
        console.error(`Background research failed: ${err}`);
      });
    }, 0);
    
    // Return immediate response with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Research job started', 
        jobId: jobId 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
