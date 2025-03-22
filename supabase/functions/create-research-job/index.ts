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

// Function to generate analysis with streaming using OpenRouter
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
) {
  console.log(`Generating streaming analysis for iteration ${iterationNumber} of job ${jobId}`);
  
  try {
    // Initial update to set an empty analysis
    const { data: iterationData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
      
    if (!iterationData || !iterationData.iterations) {
      throw new Error("Could not find iterations data for job");
    }
    
    // Find the current iteration
    const iterations = [...iterationData.iterations];
    const iterationIndex = iterations.findIndex(iter => iter.iteration === iterationNumber);
    
    if (iterationIndex === -1) {
      throw new Error(`Could not find iteration ${iterationNumber} in job data`);
    }
    
    // Initialize with empty analysis
    iterations[iterationIndex].analysis = "";
    
    // Update the database with the empty analysis
    await supabaseClient
      .from('research_jobs')
      .update({ iterations })
      .eq('id', jobId);
      
    // Prepare system message
    let systemMessage = `You are an expert research analyst summarizing search results for the query: "${query}".`;
    
    if (focusText) {
      systemMessage += ` Pay special attention to information relevant to: "${focusText}".`;
    }
    
    // Add context about previous analyses
    if (previousAnalyses && previousAnalyses.length > 0) {
      systemMessage += ` You have already analyzed some information in previous iterations. Consider this when providing your new analysis.`;
    }
    
    // Add market price context if available
    if (marketPrice !== undefined) {
      systemMessage += ` The current market probability is ${marketPrice}%.`;
    }
    
    // Add related markets context if available
    if (relatedMarkets && relatedMarkets.length > 0) {
      systemMessage += ` Consider these related markets: ${relatedMarkets.map(m => `"${m.question}" (${Math.round(m.probability * 100)}%)`).join(", ")}`;
    }
    
    // Add areas for research context if available
    if (areasForResearch && areasForResearch.length > 0) {
      systemMessage += ` Previously identified areas for further research: ${areasForResearch.join(", ")}`;
    }
    
    systemMessage += ` Your task is to provide an in-depth analysis of the search results, highlighting key insights, patterns, and conclusions. Include reliable sources and identify areas for further research.`;
    
    // Add markdown formatting instructions
    systemMessage += ` Format your response as markdown with sections including 'Key Insights', 'Analysis', 'Evidence', and 'Areas for Further Research'.`;
    
    // Prepare user message with content
    const userMessage = `Here are the search results to analyze for "${query}":\n\n${content}`;
    
    // Prepare previous analyses as context if available
    let previousAnalysesMessages = [];
    if (previousAnalyses && previousAnalyses.length > 0) {
      previousAnalysesMessages = previousAnalyses.map((analysis, idx) => ({
        role: "assistant",
        content: `Previous Iteration ${idx+1} Analysis:\n${analysis}`
      }));
    }
    
    // Call OpenRouter with streaming
    const messages = [
      { role: "system", content: systemMessage },
      ...previousAnalysesMessages,
      { role: "user", content: userMessage }
    ];
    
    console.log(`Sending ${messages.length} messages to OpenRouter for analysis`);
    
    // Use fetch with streaming option
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: messages,
        stream: true
      })
    });
    
    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${openRouterResponse.statusText}`);
    }
    
    if (!openRouterResponse.body) {
      throw new Error("OpenRouter response body is null");
    }
    
    const reader = openRouterResponse.body.getReader();
    const decoder = new TextDecoder();
    let analysisText = "";
    let chunkCount = 0;
    
    // Process the stream
    async function processStream() {
      let fullContent = "";
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`Stream complete after ${chunkCount} chunks`);
          
          // Final update to ensure we've saved everything
          if (fullContent.length > 0) {
            console.log(`Updating final content (${fullContent.length} chars) for iteration ${iterationNumber}`);
            
            // Final update to the database
            const { data: finalIterationData } = await supabaseClient
              .from('research_jobs')
              .select('iterations')
              .eq('id', jobId)
              .single();
              
            if (finalIterationData && finalIterationData.iterations) {
              const finalIterations = [...finalIterationData.iterations];
              const finalIterationIndex = finalIterations.findIndex(iter => iter.iteration === iterationNumber);
              
              if (finalIterationIndex !== -1) {
                finalIterations[finalIterationIndex].analysis = fullContent;
                
                await supabaseClient
                  .from('research_jobs')
                  .update({ iterations: finalIterations })
                  .eq('id', jobId);
              }
            }
          }
          
          return fullContent;
        }
        
        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        
        // Split the chunk by lines and parse each line
        const lines = chunk.split("\n").filter(line => line.trim() !== "");
        
        for (const line of lines) {
          try {
            // Check if line is just [DONE]
            if (line.includes('[DONE]')) {
              continue;
            }
            
            // Remove the "data: " prefix if present
            const jsonStr = line.startsWith("data: ") ? line.slice(5) : line;
            
            // Skip empty lines or keep-alive lines
            if (jsonStr.trim() === "" || jsonStr === "[DONE]") {
              continue;
            }
            
            const data = JSON.parse(jsonStr);
            
            // Extract content from different possible structures
            // Try delta.content first, then delta.reasoning, then choices[0].delta.content
            let contentChunk = "";
            
            if (data.choices && data.choices.length > 0) {
              const delta = data.choices[0].delta;
              
              // Check various possible fields, using optional chaining for safety
              contentChunk = delta?.content || delta?.reasoning || "";
              
              // If we still don't have content, try to find it elsewhere in the structure
              if (!contentChunk && data.choices[0].message) {
                contentChunk = data.choices[0].message.content || "";
              }
            }
            
            if (contentChunk) {
              analysisText += contentChunk;
              fullContent += contentChunk;
              
              // Periodically update the database
              if (chunkCount % 10 === 0) {
                console.log(`Updating analysis after ${chunkCount} chunks (${analysisText.length} chars)`);
                
                // Get current iterations
                const { data: currentIterationData } = await supabaseClient
                  .from('research_jobs')
                  .select('iterations')
                  .eq('id', jobId)
                  .single();
                  
                if (currentIterationData && currentIterationData.iterations) {
                  const currentIterations = [...currentIterationData.iterations];
                  const currentIterationIndex = currentIterations.findIndex(iter => iter.iteration === iterationNumber);
                  
                  if (currentIterationIndex !== -1) {
                    currentIterations[currentIterationIndex].analysis = analysisText;
                    
                    await supabaseClient
                      .from('research_jobs')
                      .update({ iterations: currentIterations })
                      .eq('id', jobId);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error processing stream line: ${error.message}`);
            // Continue to the next line even if this one failed
          }
        }
      }
    }
    
    // Start processing
    const finalContent = await processStream();
    return finalContent;
    
  } catch (error) {
    console.error(`Error generating analysis with streaming: ${error.message}`);
    throw error;
  }
}

// Function to generate final analysis with streaming
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
) {
  console.log(`Generating streaming final analysis for job ${jobId}`);
  
  try {
    // Update progress
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Starting final analysis generation...`)
    });
    
    // Prepare system message
    let systemMessage = `You are an expert research analyst providing a comprehensive final report on the query: "${query}".`;
    
    if (focusText) {
      systemMessage += ` Pay special attention to information relevant to: "${focusText}".`;
    }
    
    // Add context about previous analyses
    if (previousAnalyses && previousAnalyses.length > 0) {
      systemMessage += ` You already have ${previousAnalyses.length} iteration analyses to draw from.`;
    }
    
    // Add market price context if available
    if (marketPrice !== undefined) {
      systemMessage += ` The current market probability is ${marketPrice}%.`;
    }
    
    // Add related markets context if available
    if (relatedMarkets && relatedMarkets.length > 0) {
      systemMessage += ` Consider these related markets: ${relatedMarkets.map(m => `"${m.question}" (${Math.round(m.probability * 100)}%)`).join(", ")}`;
    }
    
    // Add areas for research context if available
    if (areasForResearch && areasForResearch.length > 0) {
      systemMessage += ` Previously identified areas for further research: ${areasForResearch.join(", ")}`;
    }
    
    systemMessage += ` Your task is to provide a comprehensive final analysis of all the search results, integrating insights from previous iterations, highlighting key findings, patterns, and conclusions. Include reliable sources, evaluate the evidence quality, and provide a well-reasoned analysis.`;
    
    // Add markdown formatting instructions
    systemMessage += ` Format your response as markdown with sections including 'Executive Summary', 'Key Findings', 'Evidence Analysis', 'Probability Assessment', and 'Conclusion'.`;
    
    // Prepare user message with content and previous analyses
    let userMessage = `Here is the web content to analyze for "${query}":\n\n${content}\n\n`;
    
    if (previousAnalyses && previousAnalyses.length > 0) {
      userMessage += "Here are the previous iteration analyses:\n\n";
      previousAnalyses.forEach((analysis, idx) => {
        userMessage += `==== ITERATION ${idx+1} ANALYSIS ====\n${analysis}\n\n`;
      });
    }
    
    // Call OpenRouter with streaming
    const messages = [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage }
    ];
    
    console.log(`Sending final analysis request to OpenRouter with ${messages.length} messages`);
    
    // Use fetch with streaming option
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: messages,
        stream: true
      })
    });
    
    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${openRouterResponse.statusText}`);
    }
    
    if (!openRouterResponse.body) {
      throw new Error("OpenRouter response body is null");
    }
    
    const reader = openRouterResponse.body.getReader();
    const decoder = new TextDecoder();
    let analysisText = "";
    let chunkCount = 0;
    
    // Update progress
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Streaming final analysis...`)
    });
    
    // Process the stream
    async function processStream() {
      let fullContent = "";
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`Final analysis stream complete after ${chunkCount} chunks`);
          
          // Final update to ensure we've saved everything
          if (fullContent.length > 0) {
            console.log(`Updating final analysis (${fullContent.length} chars)...`);
            
            // Update the progress log with the current state
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Final analysis generation complete (${fullContent.length} chars)`)
            });
          }
          
          return fullContent;
        }
        
        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        
        // Split the chunk by lines and parse each line
        const lines = chunk.split("\n").filter(line => line.trim() !== "");
        
        for (const line of lines) {
          try {
            // Check if line is just [DONE]
            if (line.includes('[DONE]')) {
              continue;
            }
            
            // Remove the "data: " prefix if present
            const jsonStr = line.startsWith("data: ") ? line.slice(5) : line;
            
            // Skip empty lines or keep-alive lines
            if (jsonStr.trim() === "" || jsonStr === "[DONE]") {
              continue;
            }
            
            const data = JSON.parse(jsonStr);
            
            // Extract content from different possible structures
            // Try delta.content first, then delta.reasoning, then choices[0].delta.content
            let contentChunk = "";
            
            if (data.choices && data.choices.length > 0) {
              const delta = data.choices[0].delta;
              
              // Check various possible fields, using optional chaining for safety
              contentChunk = delta?.content || delta?.reasoning || "";
              
              // If we still don't have content, try to find it elsewhere in the structure
              if (!contentChunk && data.choices[0].message) {
                contentChunk = data.choices[0].message.content || "";
              }
            }
            
            if (contentChunk) {
              analysisText += contentChunk;
              fullContent += contentChunk;
              
              // Periodically update the progress log
              if (chunkCount % 10 === 0) {
                await supabaseClient.rpc('append_research_progress', {
                  job_id: jobId,
                  progress_entry: JSON.stringify(`Generated ${analysisText.length} chars of final analysis...`)
                });
              }
            }
          } catch (error) {
            console.error(`Error processing final analysis stream line: ${error.message}`);
            // Continue to the next line even if this one failed
          }
        }
      }
    }
    
    // Start processing
    const finalContent = await processStream();
    
    // Update progress
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Final analysis complete: ${finalContent.length} characters.`)
    });
    
    return finalContent;
    
  } catch (error) {
    console.error(`Error generating final analysis with streaming: ${error.message}`);
    
    // Log the error to the progress log
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Error generating final analysis: ${error.message}`)
    });
    
    throw error;
  }
}

// Main serve function
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }
  
  // Validate request method
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  
  try {
    // Parse request body
    const { jobId, query, marketId, maxIterations = 3, focusText, notificationEmail } = await req.json();
    
    if (!jobId || !query || !marketId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters. Please provide jobId, query, and marketId.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Start background processing
    console.log(`Starting background processing for job: ${jobId}`);
    
    // Start the processing in the background
    performWebResearch(jobId, query, marketId, maxIterations, focusText, notificationEmail).catch(error => {
      console.error(`Background processing error for job ${jobId}:`, error);
    });
    
    // Return immediate success response
    return new Response(JSON.stringify({ 
      message: 'Research job started successfully',
      jobId: jobId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
