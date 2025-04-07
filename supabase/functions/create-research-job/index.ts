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

        let allResults = []; // Results for this iteration only

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
                allResults.push(processedResult); // Add to iteration results
              } catch (fetchError) {
                console.error(`Error processing result URL ${result.url}:`, fetchError);
              }
            }

            // Update the iteration with these results
            const { data: currentJobDataForIterUpdate } = await supabaseClient
              .from('research_jobs')
              .select('iterations')
              .eq('id', jobId)
              .single();

            const currentIterationData = currentJobDataForIterUpdate?.iterations || [];

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
          const { data: iterationJobData } = await supabaseClient
            .from('research_jobs')
            .select('iterations')
            .eq('id', jobId)
            .single();

          const iterationResults = iterationJobData?.iterations || [];

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
              // This function now streams the analysis directly to the DB iteration object
              await generateAnalysisWithStreaming(
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

    // Get all results from all iterations (needed for final analysis context)
    const { data: finalJobData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();

    const allIterations = finalJobData?.iterations || [];

    // Collect all results content from all iterations
    const allResultsContent = [];
    for (const iteration of allIterations) {
      if (iteration.results && Array.isArray(iteration.results)) {
        allResultsContent.push(...iteration.results.map(result => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`));
      }
    }
    const allContent = allResultsContent.join('\n\n');

    // --- START MODIFICATION: Update status before final analysis ---
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'generating_final_analysis' // New status
    });
    // --- END MODIFICATION ---

    // Generate final analysis with OpenRouter
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Generating final comprehensive analysis...`) // Updated log message
    });

    try {
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
        // --- START MODIFICATION: Call streaming function (appends to DB) ---
        // Generate final analysis with streaming for real-time updates
        await generateFinalAnalysisWithStreaming( // No longer assigning result
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
         await supabaseClient.rpc('append_research_progress', {
           job_id: jobId,
           progress_entry: JSON.stringify(`Completed streaming final analysis.`)
         });
        // --- END MODIFICATION ---
      } else {
        // --- START MODIFICATION: Write empty message to stream column ---
        const noContentMsg = `No content was collected for analysis regarding "${query}".`;
         await supabaseClient
           .from('research_jobs')
           .update({ final_analysis_stream: noContentMsg })
           .eq('id', jobId);
        // --- END MODIFICATION ---
      }
    } catch (analysisError) {
      console.error(`Error generating final analysis for job ${jobId}:`, analysisError);

      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Error generating final analysis: ${analysisError.message}`)
      });
      // --- START MODIFICATION: Fail job if analysis streaming fails ---
       await supabaseClient.rpc('update_research_job_status', {
         job_id: jobId,
         new_status: 'failed',
         error_msg: `Error generating final analysis: ${analysisError.message}`
       });
       if (notificationEmail) { await sendNotificationEmail(jobId, notificationEmail); }
       return; // Exit if final analysis generation failed
      // --- END MODIFICATION ---
    }

    // --- START MODIFICATION: Insight Extraction Step ---
    // Update status before extracting insights
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'extracting_insights' // New status
    });
    // --- END MODIFICATION ---

    // Now generate the structured insights with the extract-research-insights function
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Extracting structured insights...`) // Updated log message
    });

    let structuredInsights = null;
    try {
      // Get market price for the given market ID (keep this if insights function needs it)
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

      // Try to get related markets (keep this if insights function needs it)
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

      // Get all areas for research (keep this if insights function needs it)
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

      // Prepare all previous analyses (keep this if insights function needs it)
      const previousAnalyses = allIterations
        .filter(iter => iter.analysis)
        .map(iter => iter.analysis);

      // --- START MODIFICATION: Prepare payload for modified insights function ---
      // Prepare payload - Pass Job ID, remove analysis/webContent
      const insightsPayload = {
        jobId: jobId, // Pass Job ID
        marketId: marketId,
        marketQuestion: query, // Pass market question
        // Pass other context fields if extract-research-insights needs them
        focusText: focusText,
        marketPrice: marketPrice, // Pass fetched market price
        relatedMarkets: relatedMarkets, // Pass fetched related markets
        // Consider if previousAnalyses, iterations, queries are needed by insights function
        // If so, fetch/pass them here
        // previousAnalyses: previousAnalyses,
        // iterations: allIterations,
        // queries: allQueries, // Assuming queries were collected earlier
        // areasForResearch: areasForResearch,
      };

      console.log(`Calling extract-research-insights for job ${jobId}`);
      // --- END MODIFICATION ---

      // Call the extract-research-insights function to get structured insights (without streaming)
      const extractInsightsResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify(insightsPayload) // Pass modified payload
        }
      );

      if (!extractInsightsResponse.ok) {
        const errorBody = await extractInsightsResponse.text();
        throw new Error(`Failed to extract insights: ${extractInsightsResponse.statusText} - ${errorBody}`);
      }

      // Parse the JSON response directly
      const insightsResult = await extractInsightsResponse.json();
      // Assuming insights function returns { insights: {...} } or just {...}
      structuredInsights = insightsResult.insights || insightsResult; // Adjust based on actual return structure


      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Structured insights extracted.`) // New log
      });

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
      // --- START MODIFICATION: Fail job if insight extraction fails ---
       await supabaseClient.rpc('update_research_job_status', {
         job_id: jobId,
         new_status: 'failed',
         error_msg: `Error extracting insights: ${insightsError.message}`
       });
       if (notificationEmail) { await sendNotificationEmail(jobId, notificationEmail); }
       return; // Exit if insight extraction failed
      // --- END MODIFICATION ---
    }

    // --- START MODIFICATION: Final Update ---
    // Prepare final results object (insights only)
    const finalResultsPayload = {
      // data: allResults, // Keep search results if needed
      structuredInsights: structuredInsights
    };

    // Update the job with final results (insights only) and mark as complete
    const { error: finalUpdateError } = await supabaseClient
      .from('research_jobs')
      .update({
        results: finalResultsPayload, // Store only insights
        status: 'completed',
        completed_at: new Date().toISOString()
       })
      .eq('id', jobId);

     if (finalUpdateError) {
       console.error(`Error performing final update for job ${jobId}:`, finalUpdateError);
       // Handle potential final update error (e.g., set status to failed)
       await supabaseClient.rpc('update_research_job_status', {
         job_id: jobId,
         new_status: 'failed',
         error_msg: `Error saving final results: ${finalUpdateError.message}`
       });
       if (notificationEmail) { await sendNotificationEmail(jobId, notificationEmail); }
       return;
     }

    // Final progress log
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify('Research completed successfully!')
    });
    // --- END MODIFICATION ---

    // Send notification email if provided
    if (notificationEmail) {
      await sendNotificationEmail(jobId, notificationEmail);
    }

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

      // Send notification email for failure if provided
      if (notificationEmail) {
        await sendNotificationEmail(jobId, notificationEmail);
      }
    } catch (e) {
      console.error(`Failed to update job ${jobId} status:`, e);
    }
  }
}

// NEW IMPLEMENTATION: Function to generate analysis with streaming using OpenRouter
async function generateAnalysisWithStreaming(
  supabaseClient: any,
  jobId: string,
  iterationNumber: number,
  content: string,
  query: string,
  analysisType: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[]
): Promise<string> { // Changed: Return type is string (full analysis)
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');

  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment');
  }

  console.log(`Generating ${analysisType} using OpenRouter with streaming enabled`);

  // Limit content length to avoid token limits
  const contentLimit = 20000;
  const truncatedContent = content.length > contentLimit
    ? content.substring(0, contentLimit) + "... [content truncated]"
    : content;

  // Add market context to the prompt
  let contextInfo = '';

  if (marketPrice !== undefined) {
    contextInfo += `\nCurrent market prediction: ${marketPrice}% probability\n`;
  }

  if (relatedMarkets && relatedMarkets.length > 0) {
    contextInfo += '\nRelated markets:\n';
    relatedMarkets.forEach(market => {
      if (market.question && market.probability !== undefined) {
        const probability = Math.round(market.probability * 100);
        contextInfo += `- ${market.question}: ${probability}% probability\n`;
      }
    });
  }

  if (areasForResearch && areasForResearch.length > 0) {
    contextInfo += '\nAreas identified for further research:\n';
    areasForResearch.forEach(area => {
      contextInfo += `- ${area}\n`;
    });
  }

  // Add focus text section if provided
  let focusSection = '';
  if (focusText && focusText.trim()) {
    focusSection = `\nFOCUS AREA: "${focusText.trim()}"\n
Your analysis must specifically address and deeply analyze this focus area. Connect all insights to this focus.`;
  }

  // Add previous analyses section if provided
  let previousAnalysesSection = '';
  if (previousAnalyses && previousAnalyses.length > 0) {
    previousAnalysesSection = `\n\nPREVIOUS ANALYSES:
${previousAnalyses.map((analysis, idx) => `--- Analysis ${idx+1} ---\n${analysis}\n`).join('\n')}

IMPORTANT: DO NOT REPEAT information from previous analyses. Instead:
1. Build upon them with NEW insights
2. Address gaps and uncertainties from earlier analyses
3. Deepen understanding of already identified points with NEW evidence
4. Provide CONTRASTING perspectives where relevant`;
  }

  const prompt = `As a market research analyst, analyze the following web content to assess relevant information about this query: "${query}"

Content to analyze:
${truncatedContent}
${contextInfo}
${focusSection}
${previousAnalysesSection}

Please provide:

1. Key Facts and Insights: What are the most important NEW pieces of information relevant to the query?
2. Evidence Assessment: Evaluate the strength of evidence regarding the query.${focusText ? ` Make EXPLICIT connections to the focus area: "${focusText}"` : ''}
3. Probability Factors: What factors impact the likelihood of outcomes related to the query?${focusText ? ` Specifically analyze how these factors relate to: "${focusText}"` : ''}
4. Areas for Further Research: Identify specific gaps in knowledge that would benefit from additional research.
5. Conclusions: Based solely on this information, what NEW conclusions can we draw?${focusText ? ` Ensure conclusions directly address: "${focusText}"` : ''}

Present the analysis in a structured, concise format with clear sections and bullet points where appropriate.`;

  try {
    // Initialize the response stream handling
    console.log(`Starting streaming response for iteration ${iterationNumber}`);

    // Initialize a string to collect the analysis text
    let analysisText = '';
    let chunkSequence = 0;

    // First, get the current iterations
    const { data: jobData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();

    if (!jobData || !jobData.iterations) {
      throw new Error('Failed to retrieve job iterations');
    }

    // Make sure the iterations array exists
    let iterations = jobData.iterations;
    let iterationIndex = iterations.findIndex(iter => iter.iteration === iterationNumber);

    if (iterationIndex === -1) {
      throw new Error(`Iteration ${iterationNumber} not found in job data`);
    }

    // Start the fetch with stream: true
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro-preview-03-25",
        messages: [
          {
            role: "system",
            content: `You are an expert market research analyst who specializes in providing insightful, non-repetitive analysis.
When presented with a research query${focusText ? ` and focus area "${focusText}"` : ''}, you analyze web content to extract valuable insights.

Your analysis should:
1. Focus specifically on${focusText ? ` the focus area "${focusText}" and` : ''} the main query
2. Avoid repeating information from previous analyses
3. Build upon existing knowledge with new perspectives
4. Identify connections between evidence and implications
5. Be critical of source reliability and evidence quality
6. Draw balanced conclusions based solely on the evidence provided`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true, // Enable streaming response
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Process the stream
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    let incompleteChunk = '';

    // Log the start of streaming
    console.log(`Starting to process streaming response chunks for iteration ${iterationNumber}`);

    // Process chunks as they come in
    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log(`Stream complete for iteration ${iterationNumber}`);
            break;
          }

          // Decode the binary chunk to text
          const chunk = textDecoder.decode(value, { stream: true });

          // Combine with any incomplete chunk from previous iteration
          const textToParse = incompleteChunk + chunk;

          // Process the text as SSE (Server-Sent Events)
          const lines = textToParse.split('\n');

          let processedUpTo = 0;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line) continue;
            processedUpTo = textToParse.indexOf(line) + line.length + 1;

            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') continue;

              try {
                const jsonData = JSON.parse(data);
                if (jsonData.choices?.[0]?.delta?.content) {
                  const content = jsonData.choices[0].delta.content;
                  analysisText += content;
                  chunkSequence++;

                  // Update the iteration in the database with the latest text
                  // Fetch current iterations again to avoid race conditions
                  const { data: currentData } = await supabaseClient
                    .from('research_jobs')
                    .select('iterations')
                    .eq('id', jobId)
                    .single();

                  if (currentData && currentData.iterations) {
                    let updatedIterations = [...currentData.iterations];
                    let currentIterationIndex = updatedIterations.findIndex(iter => iter.iteration === iterationNumber);

                    if (currentIterationIndex !== -1) {
                      updatedIterations[currentIterationIndex].analysis = analysisText;
                      const { error: updateError } = await supabaseClient
                        .from('research_jobs')
                        .update({ iterations: updatedIterations })
                        .eq('id', jobId);

                      if (updateError) {
                        console.error(`Error updating iterations with streaming chunk:`, updateError);
                      }
                    }
                  }
                }
              } catch (parseError) {
                console.error(`Error parsing JSON in streaming chunk: ${parseError.message}`);
                console.error(`Problem JSON data: ${data}`);
              }
            }
          }
          incompleteChunk = textToParse.substring(processedUpTo);
        }
      } catch (streamError) {
        console.error(`Error processing stream:`, streamError);
        throw streamError;
      } finally {
        console.log(`Finished processing streaming response for iteration ${iterationNumber}`);
      }
    }

    await processStream();
    return analysisText; // Return the full analysis text
  } catch (error) {
    console.error(`Error in streaming analysis generation:`, error);
    throw error;
  }
}

// Function to generate final analysis with streaming using OpenRouter
async function generateFinalAnalysisWithStreaming(
  supabaseClient: any,
  jobId: string,
  content: string,
  query: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[]
): Promise<void> { // Changed: Return void
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');

  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment');
  }

  console.log(`Generating final comprehensive analysis using OpenRouter with streaming enabled`);

  // Limit content length to avoid token limits
  const contentLimit = 25000;
  const truncatedContent = content.length > contentLimit
    ? content.substring(0, contentLimit) + "... [content truncated]"
    : content;

  // Add market context to the prompt
  let contextInfo = '';

  if (marketPrice !== undefined) {
    contextInfo += `\nCurrent market prediction: ${marketPrice}% probability\n`;
  }

  if (relatedMarkets && relatedMarkets.length > 0) {
    contextInfo += '\nRelated markets:\n';
    relatedMarkets.forEach(market => {
      if (market.question && market.probability !== undefined) {
        const probability = Math.round(market.probability * 100);
        contextInfo += `- ${market.question}: ${probability}% probability\n`;
      }
    });
  }

  if (areasForResearch && areasForResearch.length > 0) {
    contextInfo += '\nAreas identified for further research:\n';
    areasForResearch.forEach(area => {
      contextInfo += `- ${area}\n`;
    });
  }

  // Add focus text section if provided
  let focusSection = '';
  if (focusText && focusText.trim()) {
    focusSection = `\nFOCUS AREA: "${focusText.trim()}"\n
Your analysis must specifically address and deeply analyze this focus area. Connect all insights to this focus.`;
  }

  // Add previous analyses section if provided
  let previousAnalysesSection = '';
  if (previousAnalyses && previousAnalyses.length > 0) {
    previousAnalysesSection = `\n\nPREVIOUS ANALYSES:
${previousAnalyses.map((analysis, idx) => `--- Analysis ${idx+1} ---\n${analysis}\n`).join('\n')}

IMPORTANT: Your final analysis should:
1. Synthesize and integrate all prior analyses into a coherent whole
2. Highlight the most important insights across all iterations
3. Resolve contradictions and tensions between different findings
4. Provide a comprehensive assessment that considers all evidence`;
  }

  const prompt = `As a market research analyst, provide a FINAL COMPREHENSIVE ANALYSIS of all information collected about this query: "${query}"

Content to analyze:
${truncatedContent}
${contextInfo}
${focusSection}
${previousAnalysesSection}

Please provide a comprehensive final analysis including:

1. Executive Summary: A concise summary of all critical findings and their implications.
2. Key Facts and Evidence: Synthesize the most important information across all research iterations.
3. Probability Assessment: Based on all evidence, what factors most significantly impact the likelihood of outcomes?${focusText ? ` Focus specifically on: "${focusText}"` : ''}
4. Conflicting Information: Identify and evaluate any contradictory information found.
5. Strength of Evidence: Assess the overall quality, relevance, and reliability of the research findings.
6. Final Conclusions: What are the most well-supported conclusions that can be drawn?${focusText ? ` Make explicit connections to: "${focusText}"` : ''}
7. Areas for Further Investigation: What specific questions remain unanswered or would benefit from additional research?

Present the analysis in a structured, comprehensive format with clear sections and bullet points where appropriate.`;

  try {
    // Initialize a string to collect the analysis text (not needed for return)
    // let finalAnalysis = '';
    let chunkSequence = 0;

    // Start the fetch with stream: true
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro-preview-03-25",
        messages: [
          {
            role: "system",
            content: `You are an expert market research analyst synthesizing all collected information into a final comprehensive analysis.
When presented with a research query${focusText ? ` and focus area "${focusText}"` : ''}, you analyze all web content and previous analyses to extract the most valuable insights.

Your final analysis should:
1. Draw together and synthesize insights from all iterations
2. Focus specifically on${focusText ? ` the focus area "${focusText}" and` : ''} the main query
3. Weigh evidence quality and assess reliability
4. Identify key patterns, trends, and implications
5. Provide a balanced, evidence-based assessment of probabilities
6. Draw comprehensive conclusions based on all available information`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true, // Enable streaming response
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Process the stream
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    let incompleteChunk = '';

    // Log the start of streaming
    console.log(`Starting to process streaming response chunks for final analysis`);

    // Process chunks as they come in
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log(`Stream complete for final analysis`);
        break;
      }

      // Decode the binary chunk to text
      const chunk = textDecoder.decode(value, { stream: true });

      // Combine with any incomplete chunk from previous iteration
      const textToParse = incompleteChunk + chunk;

      // Process the text as SSE (Server-Sent Events)
      const lines = textToParse.split('\n');

      let processedUpTo = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) continue;
        processedUpTo = textToParse.indexOf(line) + line.length + 1;

        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') continue;

          try {
            const jsonData = JSON.parse(data);
            if (jsonData.choices?.[0]?.delta?.content) {
              const contentChunk = jsonData.choices[0].delta.content;
              chunkSequence++;

              // --- START MODIFICATION ---
              // Append chunk directly to the database column
              const { error: appendError } = await supabaseClient
                .from('research_jobs')
                .update({
                  final_analysis_stream: supabaseClient.sql`final_analysis_stream || ${contentChunk}`
                })
                .eq('id', jobId);

              if (appendError) {
                console.error(`Error appending chunk ${chunkSequence} to final_analysis_stream:`, appendError);
              } else {
                 if (chunkSequence % 10 === 0) {
                   console.log(`Appended chunk ${chunkSequence} to final_analysis_stream for job ${jobId}`);
                 }
              }
              // --- END MODIFICATION ---
            }
          } catch (parseError) {
            console.error(`Error parsing JSON in streaming chunk: ${parseError.message}`);
            console.error(`Problem JSON data: ${data}`);
          }
        }
      }
      incompleteChunk = textToParse.substring(processedUpTo);
    }

    console.log(`Final analysis streaming complete, total chunks: ${chunkSequence}`);
    // No need to return the full text

  } catch (error) {
    console.error(`Error in streaming final analysis generation:`, error);
    throw error;
  }
}

// Function to generate analysis using OpenRouter (Old version, kept for reference)
async function generateAnalysis(
  content: string,
  query: string,
  analysisType: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[]
): Promise<string> {
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');

  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment');
  }

  console.log(`Generating ${analysisType} using OpenRouter (non-streaming)`);

  // Limit content length to avoid token limits
  const contentLimit = 20000;
  const truncatedContent = content.length > contentLimit
    ? content.substring(0, contentLimit) + "... [content truncated]"
    : content;

  // Add market context to the prompt
  let contextInfo = '';

  if (marketPrice !== undefined) {
    contextInfo += `\nCurrent market prediction: ${marketPrice}% probability\n`;
  }

  if (relatedMarkets && relatedMarkets.length > 0) {
    contextInfo += '\nRelated markets:\n';
    relatedMarkets.forEach(market => {
      if (market.question && market.probability !== undefined) {
        const probability = Math.round(market.probability * 100);
        contextInfo += `- ${market.question}: ${probability}% probability\n`;
      }
    });
  }

  if (areasForResearch && areasForResearch.length > 0) {
    contextInfo += '\nAreas identified for further research:\n';
    areasForResearch.forEach(area => {
      contextInfo += `- ${area}\n`;
    });
  }

  // Add focus text section if provided
  let focusSection = '';
  if (focusText && focusText.trim()) {
    focusSection = `\nFOCUS AREA: "${focusText.trim()}"\n
Your analysis must specifically address and deeply analyze this focus area. Connect all insights to this focus.`;
  }

  // Add previous analyses section if provided
  let previousAnalysesSection = '';
  if (previousAnalyses && previousAnalyses.length > 0) {
    previousAnalysesSection = `\n\nPREVIOUS ANALYSES:
${previousAnalyses.map((analysis, idx) => `--- Analysis ${idx+1} ---\n${analysis}\n`).join('\n')}

IMPORTANT: DO NOT REPEAT information from previous analyses. Instead:
1. Build upon them with NEW insights
2. Address gaps and uncertainties from earlier analyses
3. Deepen understanding of already identified points with NEW evidence
4. Provide CONTRASTING perspectives where relevant`;
  }

  const prompt = `As a market research analyst, analyze the following web content to assess relevant information about this query: "${query}"

Content to analyze:
${truncatedContent}
${contextInfo}
${focusSection}
${previousAnalysesSection}

Please provide:

1. Key Facts and Insights: What are the most important NEW pieces of information relevant to the query?
2. Evidence Assessment: Evaluate the strength of evidence regarding the query.${focusText ? ` Make EXPLICIT connections to the focus area: "${focusText}"` : ''}
3. Probability Factors: What factors impact the likelihood of outcomes related to the query?${focusText ? ` Specifically analyze how these factors relate to: "${focusText}"` : ''}
4. Areas for Further Research: Identify specific gaps in knowledge that would benefit from additional research.
5. Conclusions: Based solely on this information, what NEW conclusions can we draw?${focusText ? ` Ensure conclusions directly address: "${focusText}"` : ''}

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
      model: "google/gemini-2.5-pro-preview-03-25",
      messages: [
        {
          role: "system",
          content: `You are an expert market research analyst who specializes in providing insightful, non-repetitive analysis.
When presented with a research query${focusText ? ` and focus area "${focusText}"` : ''}, you analyze web content to extract valuable insights.

Your analysis should:
1. Focus specifically on${focusText ? ` the focus area "${focusText}" and` : ''} the main query
2. Avoid repeating information from previous analyses
3. Build upon existing knowledge with new perspectives
4. Identify connections between evidence and implications
5. Be critical of source reliability and evidence quality
6. Draw balanced conclusions based solely on the evidence provided`
        },
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
    const { marketId, query, maxIterations = 3, focusText, notificationEmail } = await req.json()

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
        iterations: [],
        focus_text: focusText,
        notification_email: notificationEmail
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
      performWebResearch(jobId, query, marketId, maxIterations, focusText, notificationEmail).catch(err => {
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

</file_content>

Now that you have the latest state of the file, try the operation again with fewer/more precise SEARCH blocks.
(If you run into this error 3 times in a row, you may use the write_to_file tool as a fallback. Keep in mind, the write_to_file fallback is far from ideal, as this means you'll be re-writing the entire contents of the file just to make a few edits, which takes time and money. So let's bias towards using replace_in_file as effectively as possible)
</error><environment_details>
# VSCode Visible Files
supabase/functions/create-research-job/index.ts

# VSCode Open Tabs
supabase/functions/create-research-job/tsconfig.json
src/components/market/research/InsightsDisplay.tsx
src/components/market/research/StreamingAnalysisDisplay.tsx
.git/COMMIT_EDITMSG
src/components/market/research/AnalysisDisplay.tsx
src/components/market/research/IterationCard.tsx
src/components/market/research/ProgressDisplay.tsx
src/components/market/JobQueueResearchCard.tsx
supabase/functions/create-research-job/index.ts

# Current Time
4/7/2025, 1:04:09 AM (America/New_York, UTC-4:00)

# Current Mode
ACT MODE
</environment_details>
