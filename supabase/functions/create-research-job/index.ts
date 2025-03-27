/// <reference types="https://deno.land/x/supabase/functions.ts" />

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Interfaces for Data Structures ---
interface SearchResult {
  url: string;
  title: string;
  content: string;
  source: string;
}

interface Iteration {
  iteration: number;
  queries: string[];
  results: SearchResult[];
  analysis?: string;
  reasoning?: string;
}

interface RelatedMarket {
  market_id: string;
  question: string;
  probability: number;
}

interface StructuredInsights {
  probability?: string;
  keyInsights?: string[];
  evidenceAssessment?: string;
  conflictingInfo?: string;
  areasForResearch?: string[];
  rawContent?: string; // For storing raw response on error
  error?: string; // For storing error messages
}

interface FinalResults {
  data: SearchResult[];
  analysis: string;
  structuredInsights: StructuredInsights | null;
  reasoning?: string; // Added for final analysis reasoning
}


// Function to send a notification email
const sendNotificationEmail = async (jobId: string, email: string): Promise<void> => {
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
  } catch (error: unknown) { // Type error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error sending notification email for job ${jobId}:`, errorMessage);
  }
};

// Function to perform web research
const performWebResearch = async (jobId: string, query: string, marketId: string, maxIterations: number, focusText?: string, notificationEmail?: string): Promise<void> => {
  console.log(`Starting background research for job ${jobId}`)
  let supabaseClient: SupabaseClient | null = null; // Define here for access in final catch

  try {
    supabaseClient = createClient(
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

      if (!marketError && marketData?.question) {
        marketQuestion = marketData.question;
        console.log(`Retrieved market question: "${marketQuestion}"`);
      } else {
        console.log(`Could not retrieve market question, using query as fallback`);
        if (marketError) console.error('Market fetch error:', marketError.message);
      }
    } catch (marketFetchError: unknown) {
      const errorMessage = marketFetchError instanceof Error ? marketFetchError.message : String(marketFetchError);
      console.error(`Error fetching market details:`, errorMessage);
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

      // --- Start of Iteration Try Block ---
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
          const errorText = await generateQueriesResponse.text();
          throw new Error(`Failed to generate queries: ${generateQueriesResponse.status} ${errorText}`);
        }

        const { queries } = await generateQueriesResponse.json();
        console.log(`Generated ${queries.length} queries for iteration ${i}:`, queries);

        // Add generated queries to previous queries to avoid repetition
        previousQueries.push(...queries);
        // Store the queries in the iteration data
        const iterationData: Iteration = {
          iteration: i,
          queries: queries,
          results: [] // Explicitly typed SearchResult[]
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

        let currentIterationResults: SearchResult[] = []; // Use explicit type

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
              const errorText = await braveSearchResponse.text();
              console.error(`Error searching for query "${currentQuery}": ${braveSearchResponse.status} ${errorText}`);
              continue; // Skip this query on error
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
            const validResults: SearchResult[] = []; // Use explicit type

            for (const result of webResults) {
              // Skip if we've seen this URL before
              if (seenUrls.has(result.url)) continue;

              try {
                // Add to seen URLs set
                seenUrls.add(result.url);
                // Simplified content extraction
                const processedResult: SearchResult = {
                  url: result.url,
                  title: result.title || '',
                  content: result.description || '',
                  source: 'brave_search'
                };

                validResults.push(processedResult);
                currentIterationResults.push(processedResult); // Add to current iteration results
              } catch (fetchError: unknown) {
                const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
                console.error(`Error processing result URL ${result.url}:`, errorMessage);
              }
            }

            // Update the iteration with these results
            const { data: dbData, error: fetchError } = await supabaseClient // Correctly fetch data
              .from('research_jobs')
              .select('iterations')
              .eq('id', jobId)
              .single();

            if (fetchError) {
              console.error(`Error fetching iterations before update for query "${currentQuery}":`, fetchError);
              continue; // Skip this result update if fetch failed
            }

            const currentDbIterations: Iteration[] = dbData?.iterations || [];

            // Find the current iteration
            const iterationIndex = currentDbIterations.findIndex((iter: Iteration) => iter.iteration === i); // Add type
            if (iterationIndex !== -1) {
                // Add these results to the existing results
                const updatedIterations = [...currentDbIterations];
                const currentResults = updatedIterations[iterationIndex].results || [];
                // Ensure validResults are SearchResult[]
                updatedIterations[iterationIndex].results = [...currentResults, ...validResults];

                // Update the database
                const { error: updateError } = await supabaseClient
                  .from('research_jobs')
                  .update({ iterations: updatedIterations })
                  .eq('id', jobId);
                if (updateError) {
                    console.error(`Error updating iterations after query "${currentQuery}":`, updateError);
                }
              } else {
                  console.error(`Could not find iteration ${i} to update results for query "${currentQuery}"`);
              }

          } catch (queryError: unknown) { // Type the error
            const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
            console.error(`Error processing query "${currentQuery}":`, errorMessage);
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Error processing query "${currentQuery}": ${errorMessage}`)
            });
          }
        } // End query loop

        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Completed searches for iteration ${i} with ${currentIterationResults.length} total results`)
        });

        // After each iteration, analyze the collected data using OpenRouter
        try { // Wrap analysis call
          const { data: iterData, error: iterFetchError } = await supabaseClient // Correctly fetch data
            .from('research_jobs')
            .select('iterations')
            .eq('id', jobId)
            .single();

          if (iterFetchError) {
            throw new Error(`Failed to fetch iterations before analysis: ${iterFetchError.message}`);
          }

          const iterationResults: Iteration[] = iterData?.iterations || [];

          // Find the current iteration's results
          const currentIterationData = iterationResults.find((iter: Iteration) => iter.iteration === i); // Add type

          if (currentIterationData && currentIterationData.results && currentIterationData.results.length > 0) {
            await supabaseClient.rpc('append_research_progress', {
              job_id: jobId,
              progress_entry: JSON.stringify(`Analyzing ${currentIterationData.results.length} results for iteration ${i}...`)
            });

            // Combine all content from the results
            const combinedContent = currentIterationData.results
              .map((result: SearchResult) => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`) // Add type
              .join('\n\n');

            if (combinedContent.length > 0) {
              // Get market price for context
              let marketPrice: number | undefined = undefined;
              try {
                const { data: priceData } = await supabaseClient
                  .from('market_prices')
                  .select('last_traded_price')
                  .eq('market_id', marketId)
                  .order('timestamp', { ascending: false })
                  .limit(1)
                  .maybeSingle(); // Use maybeSingle to handle null

                if (priceData?.last_traded_price !== null && priceData?.last_traded_price !== undefined) {
                  marketPrice = Math.round(priceData.last_traded_price * 100);
                  console.log(`Found market price for ${marketId}: ${marketPrice}%`);
                }
              } catch (priceError: unknown) {
                const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
                console.error(`Error fetching market price for ${marketId}:`, errorMessage);
              }

              // Try to get related markets for context
              const relatedMarkets: RelatedMarket[] = []; // Use explicit type
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
                        .limit(1)
                        .maybeSingle(); // Use maybeSingle

                        if (marketData?.question && priceData?.last_traded_price !== null && priceData?.last_traded_price !== undefined) {
                          relatedMarkets.push({
                            market_id: relation.related_market_id,
                            question: marketData.question,
                            probability: priceData.last_traded_price // Ensure probability is number
                          });
                      }
                    } catch (relatedError: unknown) {
                      const errorMessage = relatedError instanceof Error ? relatedError.message : String(relatedError);
                      console.error(`Error fetching details for related market ${relation.related_market_id}:`, errorMessage);
                    }
                  }
                }
              } catch (relatedError: unknown) {
                const errorMessage = relatedError instanceof Error ? relatedError.message : String(relatedError);
                console.error(`Error fetching related markets for ${marketId}:`, errorMessage);
              }

              // Collect areas for research that may have been identified in previous iterations
              const areasForResearch: string[] = []; // Use explicit type
              try {
                for (const iter of iterationResults) { // Use different variable name
                  if (iter.analysis) {
                    // Look for a section with "areas for further research" or similar
                    const analysisTextLower = iter.analysis.toLowerCase();
                    if (analysisTextLower.includes("areas for further research") ||
                        analysisTextLower.includes("further research needed") ||
                        analysisTextLower.includes("additional research")) {
                      // Extract areas if possible
                      const lines = iter.analysis.split('\n');
                      let inAreaSection = false;

                      for (const line of lines) {
                        const lineLower = line.toLowerCase();
                        if (!inAreaSection) {
                          if (lineLower.includes("areas for") ||
                              lineLower.includes("further research") ||
                              lineLower.includes("additional research")) {
                            inAreaSection = true;
                          }
                        } else if (line.trim().length === 0 || line.startsWith('#')) {
                          inAreaSection = false;
                        } else if (line.startsWith('-') || line.startsWith('*') ||
                           (line.match(/^\d+\.\s/) !== null)) {
                          const area = line.replace(/^[-*\d.]\s+/, '').trim();
                          if (area && !areasForResearch.includes(area)) { // Check if includes exists
                            areasForResearch.push(area);
                          }
                        }
                      }
                    }
                  }
                }
              } catch (areasError: unknown) {
                const errorMessage = areasError instanceof Error ? areasError.message : String(areasError);
                console.error(`Error extracting areas for research:`, errorMessage);
              }

              // Generate analysis for this iteration with market context
              console.log(`Calling generateAnalysisWithStreaming for iteration ${i}...`); // Log before call
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
                iterationResults.filter((iter: Iteration) => iter.iteration < i).map((iter: Iteration) => iter.analysis).filter(Boolean) as string[] // Add types and filter Boolean
              );
              console.log(`Successfully completed generateAnalysisWithStreaming for iteration ${i}`); // Log after call

              // Analysis has been streamed directly to database
              await supabaseClient.rpc('append_research_progress', {
                job_id: jobId,
                progress_entry: JSON.stringify(`Completed analysis for iteration ${i}`)
              });
            } else {
              console.log(`No combined content to analyze for iteration ${i}`);
              await supabaseClient.rpc('append_research_progress', {
                job_id: jobId,
                progress_entry: JSON.stringify(`Skipping analysis for iteration ${i} due to no content`)
              });
            }
          } else {
             console.log(`No results found to analyze for iteration ${i}`);
             await supabaseClient.rpc('append_research_progress', {
                job_id: jobId,
                progress_entry: JSON.stringify(`Skipping analysis for iteration ${i} due to no results`)
             });
          }
        } catch (analysisError: unknown) { // Type the error
          const errorMessage = analysisError instanceof Error ? analysisError.message : String(analysisError);
          console.error(`Error analyzing iteration ${i} results:`, errorMessage);
          await supabaseClient.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: JSON.stringify(`Error analyzing iteration ${i} results: ${errorMessage}`)
          });
          // Re-throw the error to be caught by the outer loop's catch block
          throw analysisError;
        }

      // --- End of Iteration Try Block ---
      } catch (iterationError: unknown) { // Catch errors specifically within the iteration loop
        const errorMessage = iterationError instanceof Error ? iterationError.message : String(iterationError);
        console.error(`Error during iteration ${i} for job ${jobId}:`, errorMessage);
        // Log the error and mark the job as failed
        if (supabaseClient) { // Check if client initialized
          await supabaseClient.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: JSON.stringify(`Error during iteration ${i}: ${errorMessage}`)
          });

          // Mark job as failed immediately
          await supabaseClient.rpc('update_research_job_status', {
            job_id: jobId,
            new_status: 'failed',
            error_msg: `Error during iteration ${i}: ${errorMessage}`
          });

          // Send notification email for failure if provided
          if (notificationEmail) {
            await sendNotificationEmail(jobId, notificationEmail);
          }
        } else {
            console.error("Supabase client not initialized, cannot update job status to failed.");
        }

        // Stop further processing by throwing the error
        throw iterationError;
      }
    } // End Iteration Loop

    // --- Final Analysis and Insights Section ---
    // Get all results from all iterations
    const { data: jobData, error: jobFetchError } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();

    // Check for error fetching final iterations
    if (jobFetchError) {
        throw new Error(`Failed to fetch final job data: ${jobFetchError.message}`);
    }

    const allIterations: Iteration[] = jobData?.iterations || []; // Use explicit type

    // Collect all results from all iterations
    const allResults: SearchResult[] = []; // Use explicit type
    for (const iteration of allIterations) {
      if (iteration.results && Array.isArray(iteration.results)) {
        allResults.push(...iteration.results); // Spread SearchResult[]
      }
    }

    // Generate final analysis with OpenRouter
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Generating final analysis of ${allResults.length} total results...`)
    });

    let finalAnalysis = "";
    let finalReasoning = ""; // Variable for final reasoning
    try { // Wrap final analysis generation
      // Combine all content from the results
      const allContent = allResults
        .map((result: SearchResult) => `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`) // Add type
        .join('\n\n');

      // Get market price for final analysis
      let marketPrice: number | undefined = undefined;
      try {
        const { data: priceData } = await supabaseClient
          .from('market_prices')
          .select('last_traded_price')
          .eq('market_id', marketId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(); // Use maybeSingle

        if (priceData?.last_traded_price !== null && priceData?.last_traded_price !== undefined) {
          marketPrice = Math.round(priceData.last_traded_price * 100);
          console.log(`Found market price for final analysis ${marketId}: ${marketPrice}%`);
        }
      } catch (priceError: unknown) {
        const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
        console.error(`Error fetching market price for final analysis ${marketId}:`, errorMessage);
      }

      // Try to get related markets for final analysis
      const relatedMarkets: RelatedMarket[] = []; // Use explicit type
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
                .limit(1)
                .maybeSingle(); // Use maybeSingle

                        if (marketData?.question && priceData?.last_traded_price !== null && priceData?.last_traded_price !== undefined) {
                          relatedMarkets.push({
                            market_id: relation.related_market_id,
                            question: marketData.question,
                            probability: priceData.last_traded_price // Ensure probability is number
                          });
              }
            } catch (relatedError: unknown) {
              const errorMessage = relatedError instanceof Error ? relatedError.message : String(relatedError);
              console.error(`Error fetching details for related market ${relation.related_market_id}:`, errorMessage);
            }
          }
        }
      } catch (relatedError: unknown) {
        const errorMessage = relatedError instanceof Error ? relatedError.message : String(relatedError);
        console.error(`Error fetching related markets for final analysis ${marketId}:`, errorMessage);
      }

      // Get all areas for research that may have been identified in previous iterations
      const areasForResearch: string[] = []; // Use explicit type
      try {
        for (const iter of allIterations) { // Use different variable name
          if (iter.analysis) {
            // Look for a section with "areas for further research" or similar
            const analysisTextLower = iter.analysis.toLowerCase();
            if (analysisTextLower.includes("areas for further research") ||
                analysisTextLower.includes("further research needed") ||
                analysisTextLower.includes("additional research")) {
              // Extract areas if possible
              const lines = iter.analysis.split('\n');
              let inAreaSection = false;

              for (const line of lines) {
                const lineLower = line.toLowerCase();
                if (!inAreaSection) {
                  if (lineLower.includes("areas for") ||
                      lineLower.includes("further research") ||
                      lineLower.includes("additional research")) {
                    inAreaSection = true;
                  }
                } else if (line.trim().length === 0 || line.startsWith('#')) {
                  inAreaSection = false;
                } else if (line.startsWith('-') || line.startsWith('*') ||
                           (line.match(/^\d+\.\s/) !== null)) {
                          const area = line.replace(/^[-*\d.]\s+/, '').trim();
                          if (area && !areasForResearch.includes(area)) { // Check if includes exists
                            areasForResearch.push(area);
                  }
                }
              }
            }
          }
        }
      } catch (areasError: unknown) {
        const errorMessage = areasError instanceof Error ? areasError.message : String(areasError);
        console.error(`Error extracting areas for research:`, errorMessage);
      }

      // Collect all previous analyses
      const previousAnalyses = allIterations
        .filter((iter: Iteration) => iter.analysis) // Add type
        .map((iter: Iteration) => iter.analysis) // Add type
        .filter(Boolean) as string[]; // Filter out undefined/null and assert as string[]

      if (allContent.length > 0) {
        // Generate final analysis with streaming for real-time updates
        console.log("Calling generateFinalAnalysisWithStreaming..."); // Log before call
        const analysisResult = await generateFinalAnalysisWithStreaming( // Capture result object
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
        finalAnalysis = analysisResult.analysis; // Extract analysis
        finalReasoning = analysisResult.reasoning; // Extract reasoning
        console.log("Completed generateFinalAnalysisWithStreaming."); // Log after call
      } else {
        finalAnalysis = `No content was collected for analysis regarding "${query}".`;
      }
    } catch (analysisError: unknown) { // Type the error
      const errorMessage = analysisError instanceof Error ? analysisError.message : String(analysisError);
      console.error(`Error generating final analysis for job ${jobId}:`, errorMessage);
      finalAnalysis = `Error generating final analysis: ${errorMessage}`;

      if (supabaseClient) { // Check if client initialized
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Error generating final analysis: ${errorMessage}`)
        });
      }
      // Re-throw to be caught by the main catch block
      throw analysisError;
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

    let structuredInsights: StructuredInsights | null = null; // Use explicit type
    try { // Wrap insights extraction
      // Get market price for the given market ID
      let marketPrice: number | undefined = undefined;
      try {
        const { data: priceData } = await supabaseClient
          .from('market_prices')
          .select('last_traded_price')
          .eq('market_id', marketId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(); // Use maybeSingle

        if (priceData?.last_traded_price !== null && priceData?.last_traded_price !== undefined) {
          marketPrice = Math.round(priceData.last_traded_price * 100);
          console.log(`Found market price for ${marketId}: ${marketPrice}%`);
        }
      } catch (priceError: unknown) {
        const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
        console.error(`Error fetching market price for ${marketId}:`, errorMessage);
      }

      // Try to get related markets
      const relatedMarkets: RelatedMarket[] = []; // Use explicit type
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
                .limit(1)
                .maybeSingle(); // Use maybeSingle

                        if (marketData?.question && priceData?.last_traded_price !== null && priceData?.last_traded_price !== undefined) {
                          relatedMarkets.push({
                            market_id: relation.related_market_id,
                            question: marketData.question,
                            probability: priceData.last_traded_price // Ensure probability is number
                          });
              }
            } catch (relatedError: unknown) {
              const errorMessage = relatedError instanceof Error ? relatedError.message : String(relatedError);
              console.error(`Error fetching details for related market ${relation.related_market_id}:`, errorMessage);
            }
          }
        }
      } catch (relatedError: unknown) {
        const errorMessage = relatedError instanceof Error ? relatedError.message : String(relatedError);
        console.error(`Error fetching related markets for ${marketId}:`, errorMessage);
      }

      // Get all areas for research that may have been identified in previous iterations
      const areasForResearch: string[] = []; // Use explicit type
      try {
        for (const iter of allIterations) { // Use different variable name
          if (iter.analysis) {
            // Look for a section with "areas for further research" or similar
            const analysisTextLower = iter.analysis.toLowerCase();
            if (analysisTextLower.includes("areas for further research") ||
                analysisTextLower.includes("further research needed") ||
                analysisTextLower.includes("additional research")) {
              // Extract areas if possible
              const lines = iter.analysis.split('\n');
              let inAreaSection = false;

              for (const line of lines) {
                const lineLower = line.toLowerCase();
                if (!inAreaSection) {
                  if (lineLower.includes("areas for") ||
                      lineLower.includes("further research") ||
                      lineLower.includes("additional research")) {
                    inAreaSection = true;
                  }
                } else if (line.trim().length === 0 || line.startsWith('#')) {
                  inAreaSection = false;
                } else if (line.startsWith('-') || line.startsWith('*') ||
                           (line.match(/^\d+\.\s/) !== null)) {
                          const area = line.replace(/^[-*\d.]\s+/, '').trim();
                          if (area && !areasForResearch.includes(area)) { // Check if includes exists
                            areasForResearch.push(area);
                  }
                }
              }
            }
          }
        }
      } catch (areasError: unknown) {
        const errorMessage = areasError instanceof Error ? areasError.message : String(areasError);
        console.error(`Error extracting areas for research:`, errorMessage);
      }

      // Prepare all previous analyses
      const previousAnalyses = allIterations
        .filter((iter: Iteration) => iter.analysis) // Add type
        .map((iter: Iteration) => iter.analysis) // Add type
        .filter(Boolean) as string[]; // Filter out undefined/null and assert as string[]

      // Collect all queries used across iterations
      const allQueries = allIterations.flatMap((iter: Iteration) => iter.queries || []); // Add type
      // Modify webContent to include iteration analyses prominently
      const webContentWithAnalyses = [
        // First add all previous analyses with proper formatting
        ...previousAnalyses.map((analysis: string, idx: number) => // Add types
          `===== PREVIOUS ITERATION ${idx+1} ANALYSIS =====\n${analysis}\n==============================`
        ),
        // Then add the web results
        ...allResults.map((r: SearchResult) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`) // Add type
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

      console.log(`Sending extract-research-insights payload...`); // Log before call
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
      console.log(`Completed extract-research-insights call.`); // Log after call

      if (!extractInsightsResponse.ok) {
        const errorText = await extractInsightsResponse.text();
        throw new Error(`Failed to extract insights: ${extractInsightsResponse.status} ${errorText}`);
      }
      // Parse the JSON response directly
      const rawInsightsResponse = await extractInsightsResponse.json();

      // Extract the actual insights content
      let insightsContent: any = null;
      if (rawInsightsResponse.choices &&
          rawInsightsResponse.choices[0] &&
          rawInsightsResponse.choices[0].message &&
          rawInsightsResponse.choices[0].message.content) {
        insightsContent = rawInsightsResponse.choices[0].message.content;
      } else {
        console.error("Invalid structure in insights response:", rawInsightsResponse);
        throw new Error("Invalid response structure from extract-research-insights");
      }

      // Try to parse the insights content if it's a string
      try {
        if (typeof insightsContent === 'string') {
          structuredInsights = JSON.parse(insightsContent);
        } else {
          structuredInsights = insightsContent; // Assume it's already an object
        }
        const probability = structuredInsights?.probability; // Use optional chaining
        console.log(`Successfully extracted structured insights with probability: ${probability}`);
        if (supabaseClient) { // Check if client initialized
          await supabaseClient.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: JSON.stringify(`Structured insights generated with probability: ${probability || "unknown"}`)
          });
        }
      } catch (parseError: unknown) { // Type the error
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        console.error(`Error parsing insights JSON: ${errorMessage}`);
        if (supabaseClient) { // Check if client initialized
          await supabaseClient.rpc('append_research_progress', {
            job_id: jobId,
            progress_entry: JSON.stringify(`Error parsing structured insights JSON: ${errorMessage}`)
          });
        }
        structuredInsights = { // Assign error structure
          error: `Failed to parse insights: ${errorMessage}`,
          rawContent: typeof insightsContent === 'string' ? insightsContent : JSON.stringify(insightsContent)
        };
      }

    } catch (insightsError: unknown) { // Type the error
      const errorMessage = insightsError instanceof Error ? insightsError.message : String(insightsError);
      console.error(`Error extracting structured insights for job ${jobId}:`, errorMessage);

      if (supabaseClient) { // Check if client initialized
        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Error extracting structured insights: ${errorMessage}`)
        });
      }

      structuredInsights = { // Assign error structure
        error: `Failed to generate insights: ${errorMessage}`
      };
      // Re-throw to be caught by the main catch block
      throw insightsError;
    }

    // Combine text analysis and structured insights
    const finalResults: FinalResults = { // Use explicit type
      ...textAnalysisResults,
      structuredInsights: structuredInsights,
      reasoning: finalReasoning // Include final reasoning
    };

    // Update the job with final results
    console.log(`Updating job ${jobId} with final results...`); // Log before final update
    await supabaseClient.rpc('update_research_results', {
      job_id: jobId,
      result_data: JSON.stringify(finalResults)
    });
    console.log(`Updated job ${jobId} results.`); // Log after results update

    // Mark job as complete
    console.log(`Marking job ${jobId} as completed...`); // Log before status update
    await supabaseClient.rpc('update_research_job_status', {
      job_id: jobId,
      new_status: 'completed'
    });
    console.log(`Marked job ${jobId} as completed.`); // Log after status update

    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify('Research completed successfully!')
    });

    // Send notification email if provided
    if (notificationEmail) {
      await sendNotificationEmail(jobId, notificationEmail);
    }

    console.log(`Completed background research for job ${jobId}`);
  } catch (error: unknown) { // Catch top-level errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in background job ${jobId}:`, errorMessage);

    if (supabaseClient) { // Check if client initialized before using
      try {
        console.log(`Attempting to mark job ${jobId} as failed due to error: ${errorMessage}`); // Log failure attempt
        // Mark job as failed
        await supabaseClient.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'failed',
          error_msg: errorMessage
        });

        await supabaseClient.rpc('append_research_progress', {
          job_id: jobId,
          progress_entry: JSON.stringify(`Research failed: ${errorMessage}`)
        });
        console.log(`Successfully marked job ${jobId} as failed.`); // Log success

        // Send notification email for failure if provided
        if (notificationEmail) {
          await sendNotificationEmail(jobId, notificationEmail);
        }
      } catch (e: unknown) { // Catch errors during failure update
        const updateErrorMessage = e instanceof Error ? e.message : String(e);
        console.error(`Failed to update job ${jobId} status to failed:`, updateErrorMessage);
      }
    } else {
        console.error("Supabase client not initialized, cannot update job status to failed.");
    }
  }
};

// Function to generate analysis with streaming using OpenRouter
const generateAnalysisWithStreaming = async ( // Change to arrow function
  supabaseClient: SupabaseClient, // Use explicit type
  jobId: string,
  iterationNumber: number,
  content: string,
  query: string,
  analysisType: string,
  marketPrice?: number,
  relatedMarkets?: RelatedMarket[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[]
): Promise<string> => { // Keep return type as string (analysis only)
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');

  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment');
  }

  console.log(`Generating ${analysisType} using OpenRouter with streaming enabled and reasoning tokens`);

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
    relatedMarkets.forEach((market: RelatedMarket) => { // Add type
      if (market.question && market.probability !== undefined) {
        const probability = Math.round(market.probability * 100);
        contextInfo += `- ${market.question}: ${probability}% probability\n`;
      }
    });
  }

  if (areasForResearch && areasForResearch.length > 0) {
    contextInfo += '\nAreas identified for further research:\n';
    areasForResearch.forEach((area: string) => { // Add type
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
${previousAnalyses.map((analysis: string, idx: number) => `--- Analysis ${idx+1} ---\n${analysis}\n`).join('\n')}

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
    console.log(`Starting streaming response for iteration ${iterationNumber} with reasoning tokens`);

    // Initialize strings to collect the analysis text and reasoning text
    let analysisText = '';
    let reasoningText = '';
    let chunkSequence = 0;

    // First, get the current iterations
    const { data: jobData, error: fetchErr1 } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();

    if (fetchErr1 || !jobData || !jobData.iterations) {
      throw new Error(`Failed to retrieve job iterations before stream: ${fetchErr1?.message}`);
    }

    // Make sure the iterations array exists
    let iterations: Iteration[] = jobData.iterations; // Use explicit type
    let iterationIndex = iterations.findIndex((iter: Iteration) => iter.iteration === iterationNumber); // Add type

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
        model: "deepseek/deepseek-r1", // Consider using a more robust model if needed
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
        temperature: 0.3,
        max_tokens: 6000, // Increase max tokens to ensure we get complete responses
        reasoning: {
          effort: "high", // Allocate a high amount of tokens for reasoning
          exclude: false  // Include reasoning in the response
        }
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

    // Throttling parameters for DB updates
    const iterUpdateBufferSize = 10; // Update DB every N chunks
    let lastAnalysisUpdateTime = 0;
    let lastReasoningUpdateTime = 0;
    const minTimeBetweenIterUpdatesMs = 500; // Minimum time

    // Process chunks as they come in
    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log(`Stream complete for iteration ${iterationNumber}`);

            // Final update for analysis
            try {
              const { error: rpcError } = await supabaseClient.rpc('update_iteration_field', {
                job_id: jobId,
                iteration_num: iterationNumber,
                field_key: 'analysis',
                field_value: analysisText
              });
              if (rpcError) {
                console.error(`Error during final analysis update RPC call:`, rpcError);
              } else {
                console.log(`Successfully sent final analysis update for iteration ${iterationNumber}`);
              }
            } catch (e) {
              console.error(`Exception during final analysis update RPC call:`, e);
            }

            // Final update for reasoning
            try {
              const { error: rpcError } = await supabaseClient.rpc('update_iteration_field', {
                job_id: jobId,
                iteration_num: iterationNumber,
                field_key: 'reasoning',
                field_value: reasoningText
              });
              if (rpcError) {
                console.error(`Error during final reasoning update RPC call:`, rpcError);
              } else {
                console.log(`Successfully sent final reasoning update for iteration ${iterationNumber}`);
              }
            } catch (e) {
              console.error(`Exception during final reasoning update RPC call:`, e);
            }

            console.log(`Finished final DB updates for iteration ${iterationNumber} stream.`);
            break;
          }

          // Decode the binary chunk to text
          const chunk = textDecoder.decode(value, { stream: true });

          // Combine with any incomplete chunk from previous iteration
          const textToParse = incompleteChunk + chunk;

          // Process the text as SSE (Server-Sent Events)
          // Each SSE message starts with "data: " and ends with two newlines
          const lines = textToParse.split('\n');

          let processedUpTo = 0;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines
            if (!line) continue;

            // Update the processedUpTo pointer
            processedUpTo = textToParse.indexOf(line) + line.length + 1; // +1 for the newline

            // Check if this is a data line
            if (line.startsWith('data: ')) {
              const data = line.substring(6); // Remove "data: " prefix

              // Skip "[DONE]" message which indicates the end of the stream
              if (data === '[DONE]') continue;

              try {
                // Parse the JSON data
                const jsonData = JSON.parse(data);

                if (jsonData.choices && jsonData.choices[0]) {
                  let analysisDelta = '';
                  let reasoningDelta = '';

                  // Check for delta content
                  if (jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                    analysisDelta = jsonData.choices[0].delta.content;
                    analysisText += analysisDelta;
                  }

                  // Check for delta reasoning
                  if (jsonData.choices[0].delta && jsonData.choices[0].delta.reasoning) {
                    reasoningDelta = jsonData.choices[0].delta.reasoning;
                    reasoningText += reasoningDelta;
                  }

                  // Or check if we have full message object (less common with streaming)
                  if (jsonData.choices[0].message) {
                    if (jsonData.choices[0].message.content) {
                      analysisDelta = jsonData.choices[0].message.content; // Assuming full content replaces delta
                      analysisText += analysisDelta;
                    }
                    if (jsonData.choices[0].message.reasoning) {
                      reasoningDelta = jsonData.choices[0].message.reasoning; // Assuming full content replaces delta
                      reasoningText += reasoningDelta;
                    }
                  }

                  // Increment chunk sequence
                  chunkSequence++;
                  const now = Date.now();

                  // Update analysis field periodically via RPC
                  if (analysisDelta && (chunkSequence % iterUpdateBufferSize === 0 || now - lastAnalysisUpdateTime > minTimeBetweenIterUpdatesMs)) {
                    try {
                      // Non-blocking RPC call
                      supabaseClient.rpc('update_iteration_field', {
                        job_id: jobId,
                        iteration_num: iterationNumber,
                        field_key: 'analysis',
                        field_value: analysisText // Send the complete accumulated text
                      }).then(({ error: rpcError }: { error: any }) => { // Add explicit type for rpcError
                        if (rpcError) {
                          console.error(`Error updating analysis via RPC:`, rpcError);
                        } else {
                          // console.log(`Sent analysis update chunk ${chunkSequence}`); // Optional: too verbose?
                        }
                      });
                      lastAnalysisUpdateTime = now;
                    } catch (e) {
                      console.error(`Exception calling analysis update RPC:`, e);
                    }
                  }

                  // Update reasoning field periodically via RPC
                  if (reasoningDelta && (chunkSequence % iterUpdateBufferSize === 0 || now - lastReasoningUpdateTime > minTimeBetweenIterUpdatesMs)) {
                     try {
                      // Non-blocking RPC call
                      supabaseClient.rpc('update_iteration_field', {
                        job_id: jobId,
                        iteration_num: iterationNumber,
                        field_key: 'reasoning',
                        field_value: reasoningText // Send the complete accumulated text
                      }).then(({ error: rpcError }: { error: any }) => { // Add explicit type for rpcError
                        if (rpcError) {
                          console.error(`Error updating reasoning via RPC:`, rpcError);
                        } else {
                          // console.log(`Sent reasoning update chunk ${chunkSequence}`); // Optional: too verbose?
                        }
                      });
                      lastReasoningUpdateTime = now;
                    } catch (e) {
                      console.error(`Exception calling reasoning update RPC:`, e);
                    }
                  }
                }
              } catch (parseError: unknown) { // Type error
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                console.error(`Error parsing JSON in streaming chunk: ${errorMessage}`);
                console.error(`Problem JSON data: ${data}`);
                // Continue processing other chunks even if one fails
              }
            }
          }

          // Save any incomplete chunk for the next iteration
          incompleteChunk = textToParse.substring(processedUpTo);
        }
      } catch (streamError: unknown) { // Type error
        const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
        console.error(`Error processing stream:`, errorMessage);
        throw streamError; // Re-throw original error
      } finally {
        console.log(`Finished processing streaming response for iteration ${iterationNumber}`);
      }
    }

    // Start processing the stream
    await processStream();

    // Return the full analysis text
    return analysisText;
  } catch (error: unknown) { // Type the error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in streaming analysis generation:`, errorMessage);
    throw error; // Re-throw original error
  }
};

// Function to generate final analysis with streaming using OpenRouter
const generateFinalAnalysisWithStreaming = async ( // Change to arrow function
  supabaseClient: SupabaseClient, // Use explicit type
  jobId: string,
  content: string,
  query: string,
  marketPrice?: number,
  relatedMarkets?: RelatedMarket[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[]
): Promise<{ analysis: string; reasoning: string }> => { // Return object with analysis and reasoning
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
    relatedMarkets.forEach((market: RelatedMarket) => { // Add type
      if (market.question && market.probability !== undefined) {
        const probability = Math.round(market.probability * 100);
        contextInfo += `- ${market.question}: ${probability}% probability\n`;
      }
    });
  }

  if (areasForResearch && areasForResearch.length > 0) {
    contextInfo += '\nAreas identified for further research:\n';
    areasForResearch.forEach((area: string) => { // Add type
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
${previousAnalyses.map((analysis: string, idx: number) => `--- Analysis ${idx+1} ---\n${analysis}\n`).join('\n')}

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
    // Initialize a string to collect the analysis text and reasoning text
    let finalAnalysis = '';
    let finalReasoning = '';
    let chunkSequence = 0;

    // Create temporary results object for updates during streaming
    let temporaryResults: Partial<FinalResults> = { // Use Partial as data might be missing initially
      analysis: '',
      reasoning: '',
      data: [] // Assuming data is not streamed here, but added later
    };

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
        model: "deepseek/deepseek-r1", // Consider using a more robust model if needed
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
        temperature: 0.3,
        max_tokens: 6000, // Increase max tokens to ensure complete responses
        reasoning: {
          effort: "high", // Allocate a high amount of tokens for reasoning
          exclude: false  // Include reasoning in the response
        }
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

    // Throttling parameters for DB updates
    const finalUpdateBufferSize = 10; // Update DB every N chunks
    let lastUpdateTime = 0;
    const minTimeBetweenFinalUpdatesMs = 500; // Minimum time between updates

    // Function to update the database with current content using RPC
    const updateDatabaseWithRpc = async (): Promise<void> => {
      try {
        // Update the temporary results object (ensure reasoning is included)
        temporaryResults.analysis = finalAnalysis;
        temporaryResults.reasoning = finalReasoning;

        // Update the research_job results field via RPC
        // Note: update_research_results expects the *entire* results object
        const { error: rpcError } = await supabaseClient.rpc('update_research_results', {
          job_id: jobId,
          result_data: JSON.stringify(temporaryResults) // Send the partial results object
        });

        if (rpcError) {
          console.error(`Error updating final results with streaming chunk via RPC:`, rpcError);
        } else {
          // console.log(`Updated final results with streaming chunk ${chunkSequence}`); // Optional: too verbose?
        }
      } catch (updateError: unknown) { // Type error
        const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
        console.error(`Exception updating final results with streaming chunk via RPC:`, errorMessage);
      }
    }

    // Process chunks as they come in
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log(`Stream complete for final analysis`);

        // Final update to ensure everything is saved
        await updateDatabaseWithRpc();
        console.log(`Finished final DB update for final analysis stream.`);

        break;
      }

      // Decode the binary chunk to text
      const chunk = textDecoder.decode(value, { stream: true });

      // Combine with any incomplete chunk from previous iteration
      const textToParse = incompleteChunk + chunk;

      // Process the text as SSE (Server-Sent Events)
      // Each SSE message starts with "data: " and ends with two newlines
      const lines = textToParse.split('\n');

      let processedUpTo = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        // Update the processedUpTo pointer
        processedUpTo = textToParse.indexOf(line) + line.length + 1; // +1 for the newline

        // Check if this is a data line
        if (line.startsWith('data: ')) {
          const data = line.substring(6); // Remove "data: " prefix

          // Skip "[DONE]" message which indicates the end of the stream
          if (data === '[DONE]') continue;

          try {
            // Parse the JSON data
            const jsonData = JSON.parse(data);

            if (jsonData.choices && jsonData.choices[0]) {
              let analysisDelta = '';
              let reasoningDelta = '';
              // Check for delta content
              if (jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                analysisDelta = jsonData.choices[0].delta.content;
                finalAnalysis += analysisDelta;
              }

              // Check for delta reasoning
              if (jsonData.choices[0].delta && jsonData.choices[0].delta.reasoning) {
                reasoningDelta = jsonData.choices[0].delta.reasoning;
                finalReasoning += reasoningDelta;
              }

              // Or check if we have full message object
              if (jsonData.choices[0].message) {
                if (jsonData.choices[0].message.content) {
                  analysisDelta = jsonData.choices[0].message.content; // Assuming full content replaces delta
                  finalAnalysis += analysisDelta;
                }
                if (jsonData.choices[0].message.reasoning) {
                  reasoningDelta = jsonData.choices[0].message.reasoning; // Assuming full content replaces delta
                  finalReasoning += reasoningDelta;
                }
              }

                  // Increment chunk sequence
                  chunkSequence++;
                  const now = Date.now();

                  // Update database periodically via RPC
                  // Check if either analysis or reasoning text has changed since last update
                  const hasAnalysisChanged = temporaryResults.analysis !== finalAnalysis;
                  const hasReasoningChanged = temporaryResults.reasoning !== finalReasoning;

                  if ((hasAnalysisChanged || hasReasoningChanged) && (chunkSequence % finalUpdateBufferSize === 0 || now - lastUpdateTime > minTimeBetweenFinalUpdatesMs)) {
                    await updateDatabaseWithRpc();
                    lastUpdateTime = now;
                  }
                }
              } catch (parseError: unknown) { // Type error
            const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
            console.error(`Error parsing JSON in streaming chunk: ${errorMessage}`);
            console.error(`Problem JSON data: ${data}`);
            // Continue processing other chunks even if one fails
          }
        }
      }

      // Save any incomplete chunk for the next iteration
      incompleteChunk = textToParse.substring(processedUpTo);
    }

    console.log(`Final analysis streaming complete, total chunks: ${chunkSequence}`);
    // Return the full analysis and reasoning text
    return { analysis: finalAnalysis, reasoning: finalReasoning };
  } catch (error: unknown) { // Type the error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in streaming final analysis generation:`, errorMessage);
    throw error; // Re-throw original error
  }
};

// DEPRECATED: Function to generate analysis using OpenRouter (Old version, replaced with streaming)
// async function generateAnalysis(...) { ... }

serve(async (req: Request) => { // Add type for req
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
        // Optionally, update job status to failed here as well, though performWebResearch should handle it
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
  } catch (error: unknown) { // Type error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in main request handler:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
