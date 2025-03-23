
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to send a notification email
async function sendNotificationEmail(jobId: string, email: string) {
  if (!email) return;
  
  try {
    console.log(`Sending notification email for job ${jobId} to ${email}`);
    
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-research-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          jobId,
          email
        })
      }
    );
  } catch (error) {
    console.error(`Error sending notification email for job ${jobId}:`, error);
  }
}

// Function to perform web research
async function performWebResearch(jobId: string, query: string, marketId: string, maxIterations: number, focusText?: string, notificationEmail?: string) {
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
    
    if (focusText) {
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Research focus: ${focusText}`)
      })
    }
    
    // Get market question from the database for more context
    let marketQuestion = query; // Default to query if we can't get the market question
    try {
      const { data: marketData, error: marketError } = await supabaseClient
        .from('markets')
        .select('question')
        .eq('id', marketId)
        .single();
        
      if (!marketError && marketData && marketData.question) {
        marketQuestion = marketData.question;
        console.log(`Retrieved market question: "${marketQuestion}"`);
      } else {
        console.log(`Could not retrieve market question, using query as fallback`);
      }
    } catch (marketFetchError) {
      console.error(`Error fetching market details:`, marketFetchError);
    }
    
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
              query: query, // Keep for backward compatibility
              marketId: marketId,
              marketQuestion: marketQuestion, // Pass the question/title from the market
              marketDescription: query, // Pass the description separately
              iteration: i,
              previousQueries,
              focusText
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
        
        // Store the queries in the iteration data with explicit completion flags
        const iterationData = {
          iteration: i,
          queries: queries,
          results: [],
          isAnalysisStreaming: false,
          isReasoningStreaming: false,
          isAnalysisComplete: false,
          isReasoningComplete: false,
          isComplete: false
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
              // Get market price for context
              let marketPrice = undefined;
              try {
                const { data: priceData } = await supabaseClient
                  .from('market_prices')
                  .select('last_traded_price')
                  .eq('market_id', marketId)
                  .order('timestamp', { ascending: false })
                  .limit(1);
                  
                if (priceData && priceData.length > 0 && priceData[0].last_traded_price !== null) {
                  marketPrice = Math.round(priceData[0].last_traded_price * 100);
                  console.log(`Found market price for ${marketId}: ${marketPrice}%`);
                }
              } catch (priceError) {
                console.error(`Error fetching market price for ${marketId}:`, priceError);
              }
              
              // Try to get related markets for context
              const relatedMarkets = [];
              try {
                const { data: relatedData } = await supabaseClient
                  .from('related_markets')
                  .select('related_market_id, relationship_strength')
                  .eq('market_id', marketId)
                  .order('relationship_strength', { ascending: false })
                  .limit(5);
                  
                if (relatedData && relatedData.length > 0) {
                  for (const relation of relatedData) {
                    try {
                      // Get market details
                      const { data: marketData } = await supabaseClient
                        .from('markets')
                        .select('question')
                        .eq('id', relation.related_market_id)
                        .single();
                        
                      // Get market price
                      const { data: priceData } = await supabaseClient
                        .from('market_prices')
                        .select('last_traded_price')
                        .eq('market_id', relation.related_market_id)
                        .order('timestamp', { ascending: false })
                        .limit(1);
                        
                      if (marketData && priceData && priceData.length > 0) {
                        relatedMarkets.push({
                          market_id: relation.related_market_id,
                          question: marketData.question,
                          probability: priceData[0].last_traded_price
                        });
                      }
                    } catch (relatedError) {
                      console.error(`Error fetching details for related market ${relation.related_market_id}:`, relatedError);
                    }
                  }
                }
              } catch (relatedError) {
                console.error(`Error fetching related markets for ${marketId}:`, relatedError);
              }
              
              // Collect areas for research that may have been identified in previous iterations
              const areasForResearch = [];
              try {
                for (const iteration of iterationResults) {
                  if (iteration.analysis) {
                    // Look for a section with "areas for further research" or similar
                    const analysisText = iteration.analysis.toLowerCase();
                    if (analysisText.includes("areas for further research") || 
                        analysisText.includes("further research needed") ||
                        analysisText.includes("additional research")) {
                      // Extract areas if possible
                      const lines = iteration.analysis.split('\n');
                      let inAreaSection = false;
                      
                      for (const line of lines) {
                        if (!inAreaSection) {
                          if (line.toLowerCase().includes("areas for") || 
                              line.toLowerCase().includes("further research") ||
                              line.toLowerCase().includes("additional research")) {
                            inAreaSection = true;
                          }
                        } else if (line.trim().length === 0 || line.startsWith('#')) {
                          inAreaSection = false;
                        } else if (line.startsWith('-') || line.startsWith('*') || 
                                   (line.match(/^\d+\.\s/) !== null)) {
                          const area = line.replace(/^[-*\d.]\s+/, '').trim();
                          if (area && !areasForResearch.includes(area)) {
                            areasForResearch.push(area);
                          }
                        }
                      }
                    }
                  }
                }
              } catch (areasError) {
                console.error(`Error extracting areas for research:`, areasError);
              }
              
              // Generate analysis for this iteration with market context
              const analysisText = await generateAnalysisWithStreaming(
                supabaseClient,
                jobId,
                i,
                combinedContent, 
                query, 
                `Iteration ${i} analysis for "${query}"`,
                marketPrice,
                relatedMarkets,
                areasForResearch,
                focusText,
                iterationResults.filter(iter => iter.iteration < i).map(iter => iter.analysis).filter(Boolean)
              );
              
              // Analysis has been streamed directly to database
              await supabaseClient.rpc('append_research_progress', {
                job_id: jobId,
                progress_entry: JSON.stringify(`Completed analysis for iteration ${i}`)
              });

              // Mark iteration as complete after streaming is done
              const { data: completedIterationData } = await supabaseClient
                .from('research_jobs')
                .select('iterations')
                .eq('id', jobId)
                .single();
                
              if (completedIterationData && completedIterationData.iterations) {
                const updatedIterations = [...completedIterationData.iterations];
                const iterIndex = updatedIterations.findIndex(iter => iter.iteration === i);
                
                if (iterIndex !== -1) {
                  updatedIterations[iterIndex].isComplete = true;
                  updatedIterations[iterIndex].isAnalysisComplete = true;
                  updatedIterations[iterIndex].isReasoningComplete = true;
                  
                  await supabaseClient
                    .from('research_jobs')
                    .update({ iterations: updatedIterations })
                    .eq('id', jobId);
                    
                  console.log(`Marked iteration ${i} as complete with explicit flags`);
                }
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
      
      // Get market price for final analysis
      let marketPrice = undefined;
      try {
        const { data: priceData } = await supabaseClient
          .from('market_prices')
          .select('last_traded_price')
          .eq('market_id', marketId)
          .order('timestamp', { ascending: false })
          .limit(1);
          
        if (priceData && priceData.length > 0 && priceData[0].last_traded_price !== null) {
          marketPrice = Math.round(priceData[0].last_traded_price * 100);
          console.log(`Found market price for final analysis ${marketId}: ${marketPrice}%`);
        }
      } catch (priceError) {
        console.error(`Error fetching market price for final analysis ${marketId}:`, priceError);
      }
      
      // Try to get related markets for final analysis
      const relatedMarkets = [];
      try {
        const { data: relatedData } = await supabaseClient
          .from('related_markets')
          .select('related_market_id, relationship_strength')
          .eq('market_id', marketId)
          .order('relationship_strength', { ascending: false })
          .limit(5);
          
        if (relatedData && relatedData.length > 0) {
          for (const relation of relatedData) {
            try {
              // Get market details
              const { data: marketData } = await supabaseClient
                .from('markets')
                .select('question')
                .eq('id', relation.related_market_id)
                .single();
                
              // Get market price
              const { data: priceData } = await supabaseClient
                .from('market_prices')
                .select('last_traded_price')
                .eq('market_id', relation.related_market_id)
                .order('timestamp', { ascending: false })
                .limit(1);
                
              if (marketData && priceData && priceData.length > 0) {
                relatedMarkets.push({
                  market_id: relation.related_market_id,
                  question: marketData.question,
                  probability: priceData[0].last_traded_price
                });
              }
            } catch (relatedError) {
              console.error(`Error fetching details for related market ${relation.related_market_id}:`, relatedError);
            }
          }
        }
      } catch (relatedError) {
        console.error(`Error fetching related markets for final analysis ${marketId}:`, relatedError);
      }
      
      // Get all areas for research that may have been identified in previous iterations
      const areasForResearch = [];
      try {
        for (const iteration of allIterations) {
          if (iteration.analysis) {
            // Look for a section with "areas for further research" or similar
            const analysisText = iteration.analysis.toLowerCase();
            if (analysisText.includes("areas for further research") || 
                analysisText.includes("further research needed") ||
                analysisText.includes("additional research")) {
              // Extract areas if possible
              const lines = iteration.analysis.split('\n');
              let inAreaSection = false;
              
              for (const line of lines) {
                if (!inAreaSection) {
                  if (line.toLowerCase().includes("areas for") || 
                      line.toLowerCase().includes("further research") ||
                      line.toLowerCase().includes("additional research")) {
                    inAreaSection = true;
                  }
                } else if (line.trim().length === 0 || line.startsWith('#')) {
                  inAreaSection = false;
                } else if (line.startsWith('-') || line.startsWith('*') || 
                           (line.match(/^\d+\.\s/) !== null)) {
                  const area = line.replace(/^[-*\d.]\s+/, '').trim();
                  if (area && !areasForResearch.includes(area)) {
                    areasForResearch.push(area);
                  }
                }
              }
            }
          }
        }
      } catch (areasError) {
        console.error(`Error extracting areas for research:`, areasError);
      }
      
      // Collect all previous analyses
      const previousAnalyses = allIterations
        .filter(iter => iter.analysis)
        .map(iter => iter.analysis);
      
      if (allContent.length > 0) {
        // Generate final analysis with streaming for real-time updates
        finalAnalysis = await generateFinalAnalysisWithStreaming(
          supabaseClient,
          jobId,
          allContent, 
          query, 
          marketPrice,
          relatedMarkets,
          areasForResearch,
          focusText,
          previousAnalyses
        );
        
        // FIX: Add explicit completion flags for the final iteration after streaming is complete
        console.log(`Final analysis streaming complete, setting explicit completion flags for final iteration`);
        
        // Get the current iterations data
        const { data: finalIterationData } = await supabaseClient
          .from('research_jobs')
          .select('iterations')
          .eq('id', jobId)
          .single();
          
        if (finalIterationData && finalIterationData.iterations) {
          // Find the final iteration (max iteration number)
          const updatedIterations = [...finalIterationData.iterations];
          const finalIterIndex = updatedIterations.findIndex(iter => iter.iteration === maxIterations);
          
          if (finalIterIndex !== -1) {
            // Set explicit completion flags for the final iteration
            updatedIterations[finalIterIndex].isComplete = true;
            updatedIterations[finalIterIndex].isAnalysisComplete = true;
            updatedIterations[finalIterIndex].isReasoningComplete = true;
            
            // Update the database with the completion flags
            await supabaseClient
              .from('research_jobs')
              .update({ iterations: updatedIterations })
              .eq('id', jobId);
              
            console.log(`Marked final iteration ${maxIterations} as complete with explicit flags`);
          } else {
            // If final iteration doesn't exist in the array yet (rare case), create it
            console.log(`Final iteration ${maxIterations} not found in iterations array, creating it`);
            const finalIteration = {
              iteration: maxIterations,
              queries: [],
              results: allResults,
              analysis: finalAnalysis,
              isAnalysisComplete: true,
              isReasoningComplete: true,
              isComplete: true
            };
            
            updatedIterations.push(finalIteration);
            
            // Update the database with the new iteration
            await supabaseClient
              .from('research_jobs')
              .update({ iterations: updatedIterations })
              .eq('id', jobId);
              
            console.log(`Added final iteration ${maxIterations} with explicit completion flags`);
          }
        }
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
      // Get market price for the given market ID
      let marketPrice = undefined;
      try {
        const { data: priceData } = await supabaseClient
          .from('market_prices')
          .select('last_traded_price')
          .eq('market_id', marketId)
          .order('timestamp', { ascending: false })
          .limit(1);
          
        if (priceData && priceData.length > 0 && priceData[0].last_traded_price !== null) {
          marketPrice = Math.round(priceData[0].last_traded_price * 100);
          console.log(`Found market price for ${marketId}: ${marketPrice}%`);
        }
      } catch (priceError) {
        console.error(`Error fetching market price for ${marketId}:`, priceError);
      }
      
      // Try to get related markets
      const relatedMarkets = [];
      try {
        const { data: relatedData } = await supabaseClient
          .from('related_markets')
          .select('related_market_id, relationship_strength')
          .eq('market_id', marketId)
          .order('relationship_strength', { ascending: false })
          .limit(5);
          
        if (relatedData && relatedData.length > 0) {
          for (const relation of relatedData) {
            try {
              // Get market details
              const { data: marketData } = await supabaseClient
                .from('markets')
                .select('question')
                .eq('id', relation.related_market_id)
                .single();
                
              // Get market price
              const { data: priceData } = await supabaseClient
                .from('market_prices')
                .select('last_traded_price')
                .eq('market_id', relation.related_market_id)
                .order('timestamp', { ascending: false })
                .limit(1);
                
              if (marketData && priceData && priceData.length > 0) {
                relatedMarkets.push({
                  market_id: relation.related_market_id,
                  question: marketData.question,
                  probability: priceData[0].last_traded_price
                });
              }
            } catch (relatedError) {
              console.error(`Error fetching details for related market ${relation.related_market_id}:`, relatedError);
            }
          }
        }
      } catch (relatedError) {
        console.error(`Error fetching related markets for ${marketId}:`, relatedError);
      }
      
      // Get all areas for research that may have been identified in previous iterations
      const areasForResearch = [];
      try {
        for (const iteration of allIterations) {
          if (iteration.analysis) {
            // Look for a section with "areas for further research" or similar
            const analysisText = iteration.analysis.toLowerCase();
            if (analysisText.includes("areas for further research") || 
                analysisText.includes("further research needed") ||
                analysisText.includes("additional research")) {
              // Extract areas if possible
              const lines = iteration.analysis.split('\n');
              let inAreaSection = false;
              
              for (const line of lines) {
                if (!inAreaSection) {
                  if (line.toLowerCase().includes("areas for") || 
                      line.toLowerCase().includes("further research") ||
                      line.toLowerCase().includes("additional research")) {
                    inAreaSection = true;
                  }
                } else if (line.trim().length === 0 || line.startsWith('#')) {
                  inAreaSection = false;
                } else if (line.startsWith('-') || line.startsWith('*') || 
                           (line.match(/^\d+\.\s/) !== null)) {
                  const area = line.replace(/^[-*\d.]\s+/, '').trim();
                  if (area && !areasForResearch.includes(area)) {
                    areasForResearch.push(area);
                  }
                }
              }
            }
          }
        }
      } catch (areasError) {
        console.error(`Error extracting areas for research:`, areasError);
      }
      
      // Prepare all previous analyses
      const previousAnalyses = allIterations
        .filter(iter => iter.analysis)
        .map(iter => iter.analysis);
      
      // Collect all queries used across iterations
      const allQueries = allIterations.flatMap(iter => iter.queries || []);
      
      // Modify webContent to include iteration analyses prominently
      const webContentWithAnalyses = [
        // First add all previous analyses with proper formatting
        ...previousAnalyses.map((analysis, idx) => 
          `===== PREVIOUS ITERATION ${idx+1} ANALYSIS =====\n${analysis}\n==============================`
        ),
        // Then add the web results
        ...allResults.map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
      ].join('\n\n');
      
      console.log(`Preparing web content with ${previousAnalyses.length} analyses prominently included`);
      
      // Prepare payload with all the same information as non-background research
      const insightsPayload = {
        webContent: webContentWithAnalyses,
        analysis: finalAnalysis,
        marketId: marketId,
        marketQuestion: query,
        previousAnalyses: previousAnalyses,
        iterations: allIterations,
        queries: allQueries,
        areasForResearch: areasForResearch,
        marketPrice: marketPrice,
        relatedMarkets: relatedMarkets.length > 0 ? relatedMarkets : undefined,
        focusText: focusText
      };
      
      console.log(`Sending extract-research-insights payload with:
        - ${allResults.length} web results
        - ${previousAnalyses.length} previous analyses (prominently included in webContent)
        - ${allQueries.length} queries
        - ${areasForResearch.length} areas for research
        - marketPrice: ${marketPrice || 'undefined'}
        - ${relatedMarkets.length} related markets
        - focusText: ${focusText || 'undefined'}`);
      
      // Call the extract-research-insights function to get structured insights (without streaming)
      const extractInsightsResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify(insightsPayload)
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
      if (structuredInsights && structuredInsights.choices && structuredInsights.choices.length > 0) {
        const structuredContent = structuredInsights.choices[0].message.content;
        
        // Update the research job with the structured insights
        await supabaseClient
          .from('research_jobs')
          .update({ structured_insights: structuredContent })
          .eq('id', jobId);
      }
    } catch (insightsError) {
      console.error(`Error extracting structured insights for job ${jobId}:`, insightsError);
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Error extracting structured insights: ${insightsError.message}`)
      });
    }
    
    // Update job status to completed or error
    let finalStatus = 'completed';
    if (error) {
      finalStatus = 'error';
    }
    
    // Update job status and completion timestamp
    await supabaseClient
      .from('research_jobs')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        results: textAnalysisResults
      })
      .eq('id', jobId);
    
    // Send notification email if requested
    if (notificationEmail) {
      await sendNotificationEmail(jobId, notificationEmail);
      
      // Mark notification as sent
      await supabaseClient
        .from('research_jobs')
        .update({ notification_sent: true })
        .eq('id', jobId);
    }
    
    console.log(`Research job ${jobId} completed with status: ${finalStatus}`);
    
    return textAnalysisResults;
    
  } catch (error) {
    console.error(`Error in performWebResearch for job ${jobId}:`, error);
    
    // Create Supabase client for error handling
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Update status to error
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'failed',
      error_msg: error.message
    });
    
    // Log the error
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Error: ${error.message}`)
    });
    
    throw error;
  }
}

// Helper functions for streaming analysis
async function generateAnalysisWithStreaming(
  supabaseClient,
  jobId,
  iteration,
  content,
  query,
  title,
  marketPrice,
  relatedMarkets,
  areasForResearch,
  focusText,
  previousAnalyses
) {
  await supabaseClient.rpc('append_research_progress', {
    job_id: jobId,
    progress_entry: JSON.stringify(`Streaming analysis for iteration ${iteration}...`)
  });
  
  try {
    // Mark the iteration as streaming
    const { data: iterationsData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
    
    if (iterationsData && iterationsData.iterations) {
      const updatedIterations = [...iterationsData.iterations];
      const iterIndex = updatedIterations.findIndex(iter => iter.iteration === iteration);
      
      if (iterIndex !== -1) {
        updatedIterations[iterIndex].isAnalysisStreaming = true;
        
        await supabaseClient
          .from('research_jobs')
          .update({ iterations: updatedIterations })
          .eq('id', jobId);
      }
    }
    
    console.log(`Analysis streaming started for iteration ${iteration}`);
    
    // Call analyze-web-content with streaming enabled
    const analyzeResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-web-content`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          webContent: content,
          prompt: `Iteration ${iteration}: ${query}${focusText ? ` (Focus: ${focusText})` : ''}`,
          title: title,
          marketPrice,
          relatedMarkets,
          areasForResearch,
          streaming: true,
          jobId,
          iteration,
          previousAnalyses
        })
      }
    );
    
    if (!analyzeResponse.ok) {
      throw new Error(`Failed to analyze content: ${analyzeResponse.statusText}`);
    }
    
    const responseData = await analyzeResponse.json();
    
    // Mark the iteration as complete
    const { data: updatedIterationsData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
    
    if (updatedIterationsData && updatedIterationsData.iterations) {
      const finalUpdatedIterations = [...updatedIterationsData.iterations];
      const finalIterIndex = finalUpdatedIterations.findIndex(iter => iter.iteration === iteration);
      
      if (finalIterIndex !== -1) {
        finalUpdatedIterations[finalIterIndex].isAnalysisStreaming = false;
        finalUpdatedIterations[finalIterIndex].isAnalysisComplete = true;
        
        await supabaseClient
          .from('research_jobs')
          .update({ iterations: finalUpdatedIterations })
          .eq('id', jobId);
          
        console.log(`Analysis streaming completed for iteration ${iteration}`);
      }
    }
    
    // Return combined analysis text
    return responseData.analysis || '';
    
  } catch (error) {
    console.error(`Error in generateAnalysisWithStreaming for job ${jobId}, iteration ${iteration}:`, error);
    
    // Update the streaming status to false in case of error
    try {
      const { data: errorIterationsData } = await supabaseClient
        .from('research_jobs')
        .select('iterations')
        .eq('id', jobId)
        .single();
      
      if (errorIterationsData && errorIterationsData.iterations) {
        const errorUpdatedIterations = [...errorIterationsData.iterations];
        const errorIterIndex = errorUpdatedIterations.findIndex(iter => iter.iteration === iteration);
        
        if (errorIterIndex !== -1) {
          errorUpdatedIterations[errorIterIndex].isAnalysisStreaming = false;
          errorUpdatedIterations[errorIterIndex].analysis = 
            errorUpdatedIterations[errorIterIndex].analysis || `Error analyzing data: ${error.message}`;
          
          await supabaseClient
            .from('research_jobs')
            .update({ iterations: errorUpdatedIterations })
            .eq('id', jobId);
        }
      }
    } catch (updateError) {
      console.error('Error updating iteration status after streaming error:', updateError);
    }
    
    throw error;
  }
}

async function generateFinalAnalysisWithStreaming(
  supabaseClient,
  jobId,
  content,
  query,
  marketPrice,
  relatedMarkets,
  areasForResearch,
  focusText,
  previousAnalyses
) {
  await supabaseClient.rpc('append_research_progress', {
    job_id: jobId,
    progress_entry: JSON.stringify(`Streaming final analysis...`)
  });
  
  try {
    // Get max iteration number to use for the final analysis
    const { data: jobData } = await supabaseClient
      .from('research_jobs')
      .select('max_iterations')
      .eq('id', jobId)
      .single();
    
    const maxIterations = jobData?.max_iterations || 1;
    
    // Mark the final iteration as streaming
    const { data: iterationsData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
    
    if (iterationsData && iterationsData.iterations) {
      const updatedIterations = [...iterationsData.iterations];
      
      // Check if we already have a final iteration entry
      const finalIterIndex = updatedIterations.findIndex(iter => iter.iteration === maxIterations);
      
      if (finalIterIndex !== -1) {
        // Update existing final iteration entry
        updatedIterations[finalIterIndex].isAnalysisStreaming = true;
        
        await supabaseClient
          .from('research_jobs')
          .update({ iterations: updatedIterations })
          .eq('id', jobId);
      } else {
        // Create a new final iteration entry
        const finalIteration = {
          iteration: maxIterations,
          queries: [],
          results: [],
          isAnalysisStreaming: true,
          isReasoningStreaming: false,
          isAnalysisComplete: false,
          isReasoningComplete: false,
          isComplete: false
        };
        
        await supabaseClient.rpc('append_research_iteration', {
          job_id: jobId,
          iteration_data: finalIteration
        });
      }
    }
    
    console.log(`Final analysis streaming started`);
    
    // Call analyze-web-content with streaming enabled for final analysis
    const analyzeResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-web-content`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          webContent: content,
          prompt: `Final analysis: ${query}${focusText ? ` (Focus: ${focusText})` : ''}`,
          title: `Final analysis for "${query}"`,
          marketPrice,
          relatedMarkets,
          areasForResearch,
          streaming: true,
          jobId,
          iteration: maxIterations, // Use max iterations as the iteration number for final analysis
          previousAnalyses,
          isFinalAnalysis: true
        })
      }
    );
    
    if (!analyzeResponse.ok) {
      throw new Error(`Failed to analyze final content: ${analyzeResponse.statusText}`);
    }
    
    const responseData = await analyzeResponse.json();
    
    // Mark the final iteration as complete
    const { data: updatedIterationsData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
    
    if (updatedIterationsData && updatedIterationsData.iterations) {
      const finalUpdatedIterations = [...updatedIterationsData.iterations];
      const finalIterIndex = finalUpdatedIterations.findIndex(iter => iter.iteration === maxIterations);
      
      if (finalIterIndex !== -1) {
        finalUpdatedIterations[finalIterIndex].isAnalysisStreaming = false;
        finalUpdatedIterations[finalIterIndex].isAnalysisComplete = true;
        
        await supabaseClient
          .from('research_jobs')
          .update({ iterations: finalUpdatedIterations })
          .eq('id', jobId);
          
        console.log(`Final analysis streaming completed`);
      }
    }
    
    // Return combined analysis text
    return responseData.analysis || '';
    
  } catch (error) {
    console.error(`Error in generateFinalAnalysisWithStreaming for job ${jobId}:`, error);
    
    // Update the streaming status to false in case of error
    try {
      const { data: jobData } = await supabaseClient
        .from('research_jobs')
        .select('max_iterations, iterations')
        .eq('id', jobId)
        .single();
      
      if (jobData) {
        const maxIterations = jobData.max_iterations || 1;
        
        if (jobData.iterations) {
          const errorUpdatedIterations = [...jobData.iterations];
          const errorIterIndex = errorUpdatedIterations.findIndex(iter => iter.iteration === maxIterations);
          
          if (errorIterIndex !== -1) {
            errorUpdatedIterations[errorIterIndex].isAnalysisStreaming = false;
            errorUpdatedIterations[errorIterIndex].analysis = 
              errorUpdatedIterations[errorIterIndex].analysis || `Error analyzing final data: ${error.message}`;
            
            await supabaseClient
              .from('research_jobs')
              .update({ iterations: errorUpdatedIterations })
              .eq('id', jobId);
          }
        }
      }
    } catch (updateError) {
      console.error('Error updating final iteration status after streaming error:', updateError);
    }
    
    throw error;
  }
}

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract the request body
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json()
    
    // Make sure we have required params
    if (!marketId || !query) {
      throw new Error('Missing required parameters: marketId and query are required')
    }
    
    // Create a new entry in the research_jobs table
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Create new research job record
    const { data: newJob, error: jobError } = await supabaseClient
      .from('research_jobs')
      .insert({
        market_id: marketId,
        query: query,
        status: 'queued',
        max_iterations: maxIterations,
        progress_log: [],
        iterations: [],
        focus_text: focusText || null,
        notification_email: notificationEmail || null
      })
      .select()
      .single()
    
    if (jobError) {
      throw new Error(`Failed to create research job: ${jobError.message}`)
    }
    
    const jobId = newJob.id
    
    // Start the research process in the background
    // This will return immediately but the processing will continue
    performWebResearch(jobId, query, marketId, maxIterations, focusText, notificationEmail)
      .catch(error => {
        console.error(`Background research job ${jobId} failed:`, error)
      })
    
    // Return the job ID for tracking
    return new Response(
      JSON.stringify({ jobId }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (error) {
    console.error('Error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    )
  }
})

// Define this function for debugging
function createFixedObject() {
  return {
    id: '123',
    market_id: 'test-market',
    query: 'test query',
    status: 'completed',
    max_iterations: 3,
    current_iteration: 3,
    progress_log: ['Started', 'Processing', 'Complete'],
    iterations: [
      {
        iteration: 1,
        queries: ['query1', 'query2'],
        results: [],
        analysis: 'Analysis for iteration 1',
        isComplete: true
      },
      {
        iteration: 2,
        queries: ['query3', 'query4'],
        results: [],
        analysis: 'Analysis for iteration 2',
        isComplete: true
      },
      {
        iteration: 3, 
        queries: [],
        results: [],
        analysis: 'Final analysis',
        isComplete: true
      }
    ],
    results: {
      data: [],
      analysis: 'Test analysis'
    },
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  };
}
