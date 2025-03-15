
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { addJob, addProgressLog, updateJobStatus, addJobIteration, updateJobIteration, updateJobResults, syncJobToDatabase } from '../_shared/jobQueue.ts'
import { throttledRequest } from '../_shared/rateLimiter.ts'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to perform web research
async function performWebResearch(jobId: string, query: string, marketId: string, maxIterations: number, focusText?: string) {
  console.log(`Starting background research for job ${jobId}`)
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Update job status to processing
    await updateJobStatus(jobId, 'processing')
    
    // Log start
    await addProgressLog(jobId, `Starting research for: ${query}`)
    
    if (focusText) {
      await addProgressLog(jobId, `Research focus: ${focusText}`)
    }
    
    // Track all previous queries to avoid repetition
    const previousQueries: string[] = [];
    // Track all seen URLs to avoid duplicate content
    const seenUrls = new Set<string>();
    
    // Simulate iterations
    for (let i = 1; i <= maxIterations; i++) {
      console.log(`Processing iteration ${i} for job ${jobId}`)
      
      // Update current iteration
      await updateJobIteration(jobId, i)
      
      // Sync to database every iteration
      await syncJobToDatabase(jobId, supabaseClient)
      
      // Add progress log for this iteration
      await addProgressLog(jobId, `Starting iteration ${i} of ${maxIterations}`)
      
      // Generate search queries
      try {
        await addProgressLog(jobId, `Generating search queries for iteration ${i}`)
        
        // Call the generate-queries function to get real queries
        const generateQueriesResponse = await throttledRequest(
          'openrouter',
          `job-${jobId}`,
          async () => {
            const response = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                  query,
                  marketId: marketId,
                  marketDescription: query,
                  question: query,
                  iteration: i,
                  previousQueries,
                  focusText
                })
              }
            );
            
            if (!response.ok) {
              throw new Error(`Failed to generate queries: ${response.statusText}`);
            }
            
            return response.json();
          }
        );
        
        const { queries } = generateQueriesResponse;
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
        await addJobIteration(jobId, iterationData);
        
        await addProgressLog(jobId, `Generated ${queries.length} search queries for iteration ${i}`)
        
        // Process each query with Brave Search
        await addProgressLog(jobId, `Executing Brave searches for iteration ${i}...`);
        
        let allResults = [];
        
        // Process each query sequentially
        for (let j = 0; j < queries.length; j++) {
          const currentQuery = queries[j];
          
          try {
            // Call the brave-search function with throttling
            const braveSearchResponse = await throttledRequest(
              'brave',
              `job-${jobId}`,
              async () => {
                const response = await fetch(
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
                
                if (!response.ok) {
                  throw new Error(`Error searching for query "${currentQuery}": ${response.statusText}`);
                }
                
                return response.json();
              }
            );
            
            // Extract web results
            const webResults = braveSearchResponse.web?.results || [];
            
            // Log search results count
            await addProgressLog(jobId, `Found ${webResults.length} results for "${currentQuery}"`);
            
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
            await addProgressLog(jobId, `Error processing query "${currentQuery}": ${queryError.message}`);
          }
          
          // Small delay between queries to avoid overloading
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        await addProgressLog(jobId, `Completed searches for iteration ${i} with ${allResults.length} total results`);
        
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
            await addProgressLog(jobId, `Analyzing ${currentIterationData.results.length} results for iteration ${i}...`);
            
            // Combine all content from the results
            const combinedContent = currentIterationData.results
              .map(result => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`)
              .join('\n\n');
            
            if (combinedContent.length > 0) {
              // Use throttled request for OpenRouter analysis
              const analysisText = await throttledRequest(
                'openrouter',
                `job-${jobId}`,
                async () => {
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
                  
                  return await generateAnalysis(
                    combinedContent, 
                    query, 
                    `Iteration ${i} analysis for "${query}"`,
                    marketPrice,
                    relatedMarkets,
                    areasForResearch
                  );
                }
              );
              
              // Update the iteration with the analysis
              const updatedIterations = [...iterationResults];
              const iterationIndex = updatedIterations.findIndex(iter => iter.iteration === i);
              
              if (iterationIndex >= 0) {
                updatedIterations[iterationIndex].analysis = analysisText;
                
                await supabaseClient
                  .from('research_jobs')
                  .update({ iterations: updatedIterations })
                  .eq('id', jobId);
                
                await addProgressLog(jobId, `Completed analysis for iteration ${i}`);
              }
            }
          }
        } catch (analysisError) {
          console.error(`Error analyzing iteration ${i} results:`, analysisError);
          await addProgressLog(jobId, `Error analyzing iteration ${i} results: ${analysisError.message}`);
        }
        
      } catch (error) {
        console.error(`Error generating queries for job ${jobId}:`, error);
        await addProgressLog(jobId, `Error generating queries: ${error.message}`);
      }
      
      // Sync to database at end of iteration
      await syncJobToDatabase(jobId, supabaseClient)
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
    await addProgressLog(jobId, `Generating final analysis of ${allResults.length} total results...`);
    
    let finalAnalysis = "";
    try {
      // Use throttled request for final analysis
      finalAnalysis = await throttledRequest(
        'openrouter',
        `job-${jobId}`,
        async () => {
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
          
          if (allContent.length > 0) {
            return await generateAnalysis(
              allContent, 
              query, 
              `Final comprehensive analysis for "${query}"`,
              marketPrice,
              relatedMarkets,
              areasForResearch
            );
          } else {
            return `No content was collected for analysis regarding "${query}".`;
          }
        }
      );
    } catch (analysisError) {
      console.error(`Error generating final analysis for job ${jobId}:`, analysisError);
      finalAnalysis = `Error generating analysis: ${analysisError.message}`;
      
      await addProgressLog(jobId, `Error generating final analysis: ${analysisError.message}`);
    }
    
    // Create final results object with the text analysis
    const textAnalysisResults = {
      data: allResults,
      analysis: finalAnalysis
    };
    
    // Now generate the structured insights with the extract-research-insights function
    await addProgressLog(jobId, `Generating structured insights with probability assessment...`);
    
    let structuredInsights = null;
    try {
      // Use throttled request for structured insights
      structuredInsights = await throttledRequest(
        'openrouter',
        `job-${jobId}`,
        async () => {
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
            relatedMarkets: relatedMarkets.length > 0 ? relatedMarkets : undefined
          };
          
          console.log(`Sending extract-research-insights payload with:
            - ${allResults.length} web results
            - ${previousAnalyses.length} previous analyses (prominently included in webContent)
            - ${allQueries.length} queries
            - ${areasForResearch.length} areas for research
            - marketPrice: ${marketPrice || 'undefined'}
            - ${relatedMarkets.length} related markets`);
          
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
          return await extractInsightsResponse.json();
        }
      );
      
      await addProgressLog(jobId, `Structured insights generated with probability: ${structuredInsights.choices[0].message.content.probability || "unknown"}`);
      
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
      
      await addProgressLog(jobId, `Error extracting structured insights: ${insightsError.message}`);
      
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
    await updateJobResults(jobId, finalResults);
    
    // Mark job as complete
    await updateJobStatus(jobId, 'completed');
    
    await addProgressLog(jobId, 'Research completed successfully!');
    
    // Final database sync
    await syncJobToDatabase(jobId, supabaseClient);
    
    console.log(`Completed background research for job ${jobId}`);
  } catch (error) {
    console.error(`Error in background job ${jobId}:`, error);
    
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Mark job as failed
      await updateJobStatus(jobId, 'failed');
      
      await addProgressLog(jobId, `Research failed: ${error.message || 'Unknown error'}`);
      
      // Final database sync
      await syncJobToDatabase(jobId, supabaseClient);
    } catch (e) {
      console.error(`Failed to update job ${jobId} status:`, e);
    }
  }
}

// Function to generate analysis using OpenRouter
async function generateAnalysis(
  content: string, 
  query: string, 
  analysisType: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  areasForResearch?: string[]
): Promise<string> {
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
  
  const prompt = `As a market research analyst, analyze the following web content to assess relevant information about this query: "${query}"

Content to analyze:
${truncatedContent}
${contextInfo}

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
    const { marketId, query, maxIterations = 3, focusText } = await req.json()
    
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
    
    // Create a job in Redis
    const jobId = await addJob({
      market_id: marketId,
      query: query,
      max_iterations: maxIterations,
      focus_text: focusText
    });
    
    // Sync to database for initial record
    await syncJobToDatabase(jobId, supabaseClient);
    
    // Start the background process without blocking the response
    setTimeout(() => {
      performWebResearch(jobId, query, marketId, maxIterations, focusText).catch(err => {
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
