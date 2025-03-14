
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
              previousQueries
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
          results: []
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
        
        // After each iteration, analyze the collected data using OpenRouter
        try {
          const iterationResults = (await supabaseClient
            .from('research_jobs')
            .select('iterations')
            .eq('id', jobId)
            .single()).data?.iterations || [];
          
          // Find the current iteration's results
          const currentIterationData = iterationResults.find(iter => iter.iteration === i);
          
          if (currentIterationData && currentIterationData.results && currentIterationData.results.length > 0) {
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Analyzing ${currentIterationData.results.length} results for iteration ${i}...`)
            });
            
            // Combine all content from the results
            const combinedContent = currentIterationData.results
              .map(result => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`)
              .join('\n\n');
            
            if (combinedContent.length > 0) {
              // Generate analysis for this iteration
              const analysisText = await generateAnalysis(combinedContent, query, `Iteration ${i} analysis for "${query}"`);
              
              // Update the iteration with the analysis
              const updatedIterations = [...iterationResults];
              const iterationIndex = updatedIterations.findIndex(iter => iter.iteration === i);
              
              if (iterationIndex >= 0) {
                updatedIterations[iterationIndex].analysis = analysisText;
                
                await supabaseClient
                  .from('research_jobs')
                  .update({ iterations: updatedIterations })
                  .eq('id', jobId);
                
                await supabaseClient.rpc('append_research_progress', {
                  job_id: jobId,
                  progress_entry: JSON.stringify(`Completed analysis for iteration ${i}`)
                });
              }
            }
          }
        } catch (analysisError) {
          console.error(`Error analyzing iteration ${i} results:`, analysisError);
          await supabaseClient.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: JSON.stringify(`Error analyzing iteration ${i} results: ${analysisError.message}`)
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
    
    // Generate final analysis with OpenRouter
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Generating final analysis of ${allResults.length} total results...`)
    });
    
    let finalAnalysis = "";
    try {
      // Combine all content from the results
      const allContent = allResults
        .map(result => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`)
        .join('\n\n');
      
      if (allContent.length > 0) {
        finalAnalysis = await generateAnalysis(allContent, query, `Final comprehensive analysis for "${query}"`);
      } else {
        finalAnalysis = `No content was collected for analysis regarding "${query}".`;
      }
    } catch (analysisError) {
      console.error(`Error generating final analysis for job ${jobId}:`, analysisError);
      finalAnalysis = `Error generating analysis: ${analysisError.message}`;
      
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Error generating final analysis: ${analysisError.message}`)
      });
    }
    
    // Create final results object with the text analysis
    const textAnalysisResults = {
      data: allResults,
      analysis: finalAnalysis
    };
    
    // Now generate the structured insights with the extract-research-insights function
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Generating structured insights with probability assessment...`)
    });
    
    let structuredInsights = null;
    try {
      // Call the extract-research-insights function to get structured insights (without streaming)
      const extractInsightsResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            webContent: allResults.map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join('\n\n'),
            analysis: finalAnalysis,
            marketQuestion: query
          })
        }
      );
      
      if (!extractInsightsResponse.ok) {
        throw new Error(`Failed to extract insights: ${extractInsightsResponse.statusText}`);
      }
      
      // Parse the JSON response directly
      structuredInsights = await extractInsightsResponse.json();
      
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Structured insights generated with probability: ${structuredInsights.choices[0].message.content.probability || "unknown"}`)
      });
      
      // Extract the actual insights from the OpenRouter response
      if (structuredInsights.choices && 
          structuredInsights.choices[0] && 
          structuredInsights.choices[0].message && 
          structuredInsights.choices[0].message.content) {
        
        // Get the actual insights content from the API response
        try {
          // If it's a string (JSON string), parse it
          if (typeof structuredInsights.choices[0].message.content === 'string') {
            structuredInsights = JSON.parse(structuredInsights.choices[0].message.content);
          } else {
            // If it's already an object, use it directly
            structuredInsights = structuredInsights.choices[0].message.content;
          }
          
          console.log(`Successfully extracted structured insights with probability: ${structuredInsights.probability}`);
        } catch (parseError) {
          console.error(`Error parsing insights JSON: ${parseError.message}`);
          
          // If parsing fails, store the raw content
          structuredInsights = {
            probability: "Error: Could not parse",
            rawContent: structuredInsights.choices[0].message.content
          };
        }
      } else {
        console.error("Invalid structure in insights response:", structuredInsights);
        structuredInsights = {
          probability: "Error: Invalid response format",
          error: "The AI response did not contain expected data"
        };
      }
      
    } catch (insightsError) {
      console.error(`Error extracting structured insights for job ${jobId}:`, insightsError);
      
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Error extracting structured insights: ${insightsError.message}`)
      });
      
      structuredInsights = {
        probability: "Error: Failed to generate",
        error: insightsError.message
      };
    }
    
    // Combine text analysis and structured insights
    const finalResults = {
      ...textAnalysisResults,
      structuredInsights: structuredInsights
    };
    
    // Update the job with final results
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

// Function to generate analysis using OpenRouter
async function generateAnalysis(content: string, query: string, analysisType: string): Promise<string> {
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
  
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment');
  }
  
  console.log(`Generating ${analysisType} using OpenRouter`);
  
  // Limit content length to avoid token limits
  const contentLimit = 20000;
  const truncatedContent = content.length > contentLimit 
    ? content.substring(0, contentLimit) + "... [content truncated]" 
    : content;
  
  const prompt = `As a market research analyst, analyze the following web content to assess relevant information about this query: "${query}"

Content to analyze:
${truncatedContent}

Please provide:

1. Key Facts and Insights: What are the most important pieces of information relevant to the query?
2. Evidence Assessment: Evaluate the strength of evidence regarding the query.
3. Probability Factors: What factors impact the likelihood of outcomes related to the query?
4. Conclusions: Based solely on this information, what conclusions can we draw?

Present the analysis in a structured, concise format with clear sections and bullet points where appropriate.`;
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
      "X-Title": "Market Research App",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`Invalid response from OpenRouter API: ${JSON.stringify(data)}`);
  }
  
  return data.choices[0].message.content;
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
