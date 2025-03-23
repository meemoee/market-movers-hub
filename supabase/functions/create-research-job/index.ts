
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

// Function to generate analysis with reasoning using streaming
async function generateAnalysisWithStreaming(
  supabaseClient: any,
  jobId: string,
  iteration: number,
  content: string,
  query: string,
  title: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[]
) {
  console.log(`Starting to process streaming response chunks for iteration ${iteration}`);
  
  try {
    // Use deepseek/deepseek-r1 model which provides reasoning tokens
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        "HTTP-Referer": "https://hunchex.co",
        "X-Title": "HunchEx"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1", // Use deepseek model which provides reasoning
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a professional, objective analyst who carefully examines information and provides clear insights.
            ${focusText ? `Focus your research specifically on: ${focusText}` : ""}
            Always be factual, comprehensive, and balanced in your assessments. Use the available data to provide insights.`
          },
          {
            role: "user", 
            content: `I need you to analyze the following information related to this question: "${query}"

${previousAnalyses && previousAnalyses.length > 0 ? 
  `Here are previous analyses that you've performed:\n\n${previousAnalyses.join('\n\n')}\n\n` : ''}

${content}

${marketPrice !== undefined ? `The current market probability is: ${marketPrice}%` : ''}

${relatedMarkets && relatedMarkets.length > 0 ? 
  `Here are related markets and their probabilities:\n${relatedMarkets.map(m => 
  `- ${m.question}: ${Math.round(m.probability * 100)}%`).join('\n')}` : ''}

${areasForResearch && areasForResearch.length > 0 ? 
  `Areas previously identified for further research:\n${areasForResearch.map(area => `- ${area}`).join('\n')}` : ''}

Provide a detailed analysis of this information. Do NOT simply summarize the content. Instead:
1. Evaluate the credibility and relevance of the sources
2. Identify key facts and data points
3. Analyze implications for the question "${query}"
4. Highlight any conflicting information or uncertainties
5. Identify areas for further research

Format your response as a well-structured markdown document with appropriate headers and sections.`
          }
        ]
      })
    });
    
    if (openRouterResponse.status !== 200) {
      console.error(`Error from OpenRouter: ${openRouterResponse.status}`, await openRouterResponse.text());
      throw new Error(`Non-200 response from OpenRouter: ${openRouterResponse.status}`);
    }
    
    if (!openRouterResponse.body) {
      throw new Error("Response body is null");
    }
    
    const reader = openRouterResponse.body.getReader();
    const decoder = new TextDecoder();
    let analysisText = "";
    let reasoningText = "";
    let fullResponse = "";
    let sequence = 0;
    let isDone = false;
    
    // Delete any existing analysis_stream entries for this job and iteration
    await supabaseClient
      .from('analysis_stream')
      .delete()
      .eq('job_id', jobId)
      .eq('iteration', iteration);
    
    while (!isDone) {
      const { value, done } = await reader.read();
      
      if (done) {
        isDone = true;
        break;
      }
      
      // Decode the received chunk
      const chunk = decoder.decode(value);
      fullResponse += chunk;
      
      // Process SSE chunks
      const lines = fullResponse.split('\n');
      fullResponse = lines.pop() || '';
      
      for (const line of lines) {
        if (!line || line.trim() === '') continue;
        if (line.trim() === 'data: [DONE]') {
          isDone = true;
          break;
        }
        
        if (line.startsWith('data: ')) {
          try {
            // Parse the JSON data
            const jsonData = JSON.parse(line.substring(6));
            
            if (jsonData.choices && jsonData.choices.length > 0) {
              // Extract content from the delta
              const contentDelta = jsonData.choices[0].delta?.content || '';
              const reasoningDelta = jsonData.choices[0].delta?.tool_calls?.[0]?.function?.arguments || '';
              
              // For normal content (the analysis text)
              if (contentDelta) {
                analysisText += contentDelta;
                
                // Insert the chunk into the analysis_stream table
                await supabaseClient
                  .from('analysis_stream')
                  .insert({
                    job_id: jobId,
                    chunk: contentDelta,
                    sequence: sequence++,
                    iteration: iteration
                  });
              }
              
              // For reasoning content (from tool_calls)
              if (reasoningDelta) {
                try {
                  // Attempt to parse the reasoning JSON if it's a string
                  const parsedReasoning = typeof reasoningDelta === 'string' 
                    ? JSON.parse(reasoningDelta) 
                    : reasoningDelta;
                  
                  if (parsedReasoning.reasoning) {
                    reasoningText += parsedReasoning.reasoning;
                  }
                } catch (parseError) {
                  // If it's not valid JSON, just append it as is
                  reasoningText += reasoningDelta;
                }
              }
            }
          } catch (error) {
            console.error(`Error parsing chunk: ${error.message}`, line);
          }
        }
      }
    }
    
    console.log(`Analysis streaming complete for job ${jobId}, iteration ${iteration}`);
    console.log(`Final analysis length: ${analysisText.length} characters`);
    console.log(`Final reasoning length: ${reasoningText.length} characters`);
    
    // Update the iteration in the database with the completed analysis
    const { data: iterationsData } = await supabaseClient
      .from('research_jobs')
      .select('iterations')
      .eq('id', jobId)
      .single();
      
    if (iterationsData && iterationsData.iterations) {
      const updatedIterations = [...iterationsData.iterations];
      
      // Find the right iteration to update
      for (let i = 0; i < updatedIterations.length; i++) {
        if (updatedIterations[i].iteration === iteration) {
          updatedIterations[i].analysis = analysisText;
          updatedIterations[i].reasoning = reasoningText;
          break;
        }
      }
      
      // Update the job with the new iterations data
      await supabaseClient
        .from('research_jobs')
        .update({
          iterations: updatedIterations
        })
        .eq('id', jobId);
    }
    
    return analysisText;
    
  } catch (error) {
    console.error(`Error generating analysis with streaming for job ${jobId}, iteration ${iteration}:`, error);
    throw error;
  }
}

// Function to generate final analysis with reasoning using streaming
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
  console.log(`Starting to process streaming final analysis for job ${jobId}`);
  
  try {
    // Use deepseek/deepseek-r1 model which provides reasoning tokens
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        "HTTP-Referer": "https://hunchex.co",
        "X-Title": "HunchEx"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1", // Use deepseek model which provides reasoning
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a professional, objective analyst who carefully examines information and provides clear insights.
            ${focusText ? `Focus your research specifically on: ${focusText}` : ""}
            Always be factual, comprehensive, and balanced in your assessments. Use the available data to provide insights.`
          },
          {
            role: "user", 
            content: `I need you to write a comprehensive FINAL analysis of the following web research related to this question: "${query}"

${previousAnalyses && previousAnalyses.length > 0 ? 
  `Here are previous analyses performed across different iterations:\n\n${previousAnalyses.join('\n\n')}\n\n` : ''}

${content}

${marketPrice !== undefined ? `The current market probability is: ${marketPrice}%` : ''}

${relatedMarkets && relatedMarkets.length > 0 ? 
  `Here are related markets and their probabilities:\n${relatedMarkets.map(m => 
  `- ${m.question}: ${Math.round(m.probability * 100)}%`).join('\n')}` : ''}

${areasForResearch && areasForResearch.length > 0 ? 
  `Areas previously identified for further research:\n${areasForResearch.map(area => `- ${area}`).join('\n')}` : ''}

Provide a detailed FINAL analysis of all the research collected. This is a summary of all the iterations, so be comprehensive:
1. Evaluate the quality and relevance of the sources
2. Identify the most important facts and data points
3. Analyze the overall implications for the question "${query}"
4. Assess conflicting information and uncertainties
5. Provide a balanced assessment of the current state of knowledge
6. Suggest areas for further research

Format your response as a well-structured markdown document with appropriate headers and sections.`
          }
        ]
      })
    });
    
    if (openRouterResponse.status !== 200) {
      console.error(`Error from OpenRouter: ${openRouterResponse.status}`, await openRouterResponse.text());
      throw new Error(`Non-200 response from OpenRouter: ${openRouterResponse.status}`);
    }
    
    if (!openRouterResponse.body) {
      throw new Error("Response body is null");
    }
    
    const reader = openRouterResponse.body.getReader();
    const decoder = new TextDecoder();
    let analysisText = "";
    let reasoningText = "";
    let fullResponse = "";
    let sequence = 0;
    let isDone = false;
    
    // Delete any existing analysis_stream entries for this job and final analysis (use iteration = 0)
    await supabaseClient
      .from('analysis_stream')
      .delete()
      .eq('job_id', jobId)
      .eq('iteration', 0);
    
    while (!isDone) {
      const { value, done } = await reader.read();
      
      if (done) {
        isDone = true;
        break;
      }
      
      // Decode the received chunk
      const chunk = decoder.decode(value);
      fullResponse += chunk;
      
      // Process SSE chunks
      const lines = fullResponse.split('\n');
      fullResponse = lines.pop() || '';
      
      for (const line of lines) {
        if (!line || line.trim() === '') continue;
        if (line.trim() === 'data: [DONE]') {
          isDone = true;
          break;
        }
        
        if (line.startsWith('data: ')) {
          try {
            // Parse the JSON data
            const jsonData = JSON.parse(line.substring(6));
            
            if (jsonData.choices && jsonData.choices.length > 0) {
              // Extract content from the delta
              const contentDelta = jsonData.choices[0].delta?.content || '';
              const reasoningDelta = jsonData.choices[0].delta?.tool_calls?.[0]?.function?.arguments || '';
              
              // For normal content (the analysis text)
              if (contentDelta) {
                analysisText += contentDelta;
                
                // Insert the chunk into the analysis_stream table
                await supabaseClient
                  .from('analysis_stream')
                  .insert({
                    job_id: jobId,
                    chunk: contentDelta,
                    sequence: sequence++,
                    iteration: 0  // Use 0 to indicate final analysis
                  });
              }
              
              // For reasoning content (from tool_calls)
              if (reasoningDelta) {
                try {
                  // Attempt to parse the reasoning JSON if it's a string
                  const parsedReasoning = typeof reasoningDelta === 'string' 
                    ? JSON.parse(reasoningDelta) 
                    : reasoningDelta;
                  
                  if (parsedReasoning.reasoning) {
                    reasoningText += parsedReasoning.reasoning;
                  }
                } catch (parseError) {
                  // If it's not valid JSON, just append it as is
                  reasoningText += reasoningDelta;
                }
              }
            }
          } catch (error) {
            console.error(`Error parsing chunk: ${error.message}`, line);
          }
        }
      }
    }
    
    console.log(`Final analysis streaming complete for job ${jobId}`);
    console.log(`Final analysis length: ${analysisText.length} characters`);
    console.log(`Final reasoning length: ${reasoningText.length} characters`);
    
    // Update the research job with the final analysis
    await supabaseClient
      .from('research_jobs')
      .update({
        results: {
          analysis: analysisText,
          reasoning: reasoningText
        }
      })
      .eq('id', jobId);
    
    return analysisText;
    
  } catch (error) {
    console.error(`Error generating final analysis with streaming for job ${jobId}:`, error);
    throw error;
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
          rawContent: JSON.stringify(structuredInsights)
        };
      }
      
      // Update the job with the structured insights
      await supabaseClient
        .from('research_jobs')
        .update({
          results: {
            ...textAnalysisResults,
            insights: structuredInsights
          },
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
        
    } catch (error) {
      console.error(`Error generating structured insights for job ${jobId}:`, error);
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Error generating structured insights: ${error.message}`)
      });
      
      // Update the job with error status but still include the analysis
      await supabaseClient
        .from('research_jobs')
        .update({
          results: textAnalysisResults,
          status: 'completed', // Still mark as completed, just without insights
          error_message: `Error generating insights: ${error.message}`,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }
    
    // Send notification email if requested
    if (notificationEmail) {
      await sendNotificationEmail(jobId, notificationEmail);
      
      // Mark as notification sent
      await supabaseClient
        .from('research_jobs')
        .update({
          notification_sent: true
        })
        .eq('id', jobId);
    }
    
    // Add final log entry
    await supabaseClient.rpc('append_research_progress', {
      job_id: jobId,
      progress_entry: JSON.stringify(`Research completed for: ${query}`)
    });
    
    console.log(`Research completed for job ${jobId}`);
    
  } catch (error) {
    console.error(`Error in background research for job ${jobId}:`, error);
    
    // Update job status to failed
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabaseClient.rpc('update_research_job_status', {
        job_id: jobId,
        new_status: 'failed'
      });
      
      await supabaseClient
        .from('research_jobs')
        .update({
          error_message: error.message || 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
      
      await supabaseClient.rpc('append_research_progress', {
        job_id: jobId,
        progress_entry: JSON.stringify(`Error in research: ${error.message}`)
      });
    } catch (updateError) {
      console.error(`Error updating job status for ${jobId}:`, updateError);
    }
  }
}

// Main function handler
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const requestData = await req.json();
    const { query, marketId, maxIterations = 3, focusText, email: notificationEmail } = requestData;
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    if (!marketId) {
      return new Response(
        JSON.stringify({ error: 'Market ID parameter is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Create the client 
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Create a new job record
    const { data: jobData, error } = await supabaseClient
      .from('research_jobs')
      .insert({
        query: query,
        market_id: marketId,
        max_iterations: maxIterations,
        status: 'queued',
        progress_log: [],
        focus_text: focusText || null,
        notification_email: notificationEmail || null,
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Error creating research job:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create research job' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    const jobId = jobData.id;
    
    // Start the research process in the background
    performWebResearch(jobId, query, marketId, maxIterations, focusText, notificationEmail)
      .catch(error => {
        console.error(`Unhandled error in background research for job ${jobId}:`, error);
      });
    
    return new Response(
      JSON.stringify({ 
        message: 'Research job created and started in background',
        jobId: jobId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
