// @deno-types="https://esm.sh/v135/@supabase/supabase-js@2.47.0"
import { createClient } from 'npm:@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

// Add type declarations for results array
type ResearchResult = {
  url: string;
  title: string;
  content: string;
  source: string;
};

// Add Deno namespace declaration
declare const Deno: any;

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
): Promise<string> {
  // Initialize lastUpdateTime to track database updates
  let lastUpdateTime = Date.now();
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
    console.log(`Starting streaming response for iteration ${iterationNumber} with reasoning tokens`);
    
    // Initialize strings to collect the analysis text and reasoning text
    let analysisText = '';
    let reasoningText = '';
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
    
    // Create a new stream for processing response chunks
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
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
        model: "deepseek/deepseek-r1",
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
                  // Check for delta content
                  if (jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                    const content = jsonData.choices[0].delta.content;
                    
                    // Append to the full analysis text
                    analysisText += content;
                  }
                  
                  // Check for delta reasoning
                  if (jsonData.choices[0].delta && jsonData.choices[0].delta.reasoning) {
                    const reasoning = jsonData.choices[0].delta.reasoning;
                    
                    // Append to the full reasoning text
                    reasoningText += reasoning;
                  }
                  
                  // Or check if we have full message object
                  if (jsonData.choices[0].message) {
                    if (jsonData.choices[0].message.content) {
                      analysisText += jsonData.choices[0].message.content;
                    }
                    
                    if (jsonData.choices[0].message.reasoning) {
                      reasoningText += jsonData.choices[0].message.reasoning;
                    }
                  }
                  
                  // Increment chunk sequence
                  chunkSequence++;
                  
                  // Update the iteration in the database with the latest text
                  // Make a new (not nested) call to get the current iterations
                  const { data: currentData } = await supabaseClient
                    .from('research_jobs')
                    .select('iterations')
                    .eq('id', jobId)
                    .single();
                  
                  if (currentData && currentData.iterations) {
                    // Get the current iteration data
                    let updatedIterations = [...currentData.iterations];
                    let currentIterationIndex = updatedIterations.findIndex(iter => iter.iteration === iterationNumber);
                    
                    if (currentIterationIndex !== -1) {
                      // Update the analysis and reasoning for this iteration
                      updatedIterations[currentIterationIndex].analysis = analysisText;
                      updatedIterations[currentIterationIndex].reasoning = reasoningText;
                      
                      // Batch updates to avoid spamming the database
                      if (Date.now() - lastUpdateTime > 1000) {
                        const { error } = await supabaseClient
                          .from('research_jobs')
                          .update({ 
                            iterations: updatedIterations,
                            updated_at: new Date().toISOString()
                          })
                          .eq('id', jobId);
                        
                        lastUpdateTime = Date.now();
                        
                        if (error) {
                          console.error(`Error updating iterations with streaming chunk:`, error);
                        }
                      }
                    }
                  }
                }
              } catch (parseError) {
                console.error(`Error parsing JSON in streaming chunk: ${parseError.message}`);
                console.error(`Problem JSON data: ${data}`);
                // Continue processing other chunks even if one fails
              }
            }
          }

          // Save any incomplete chunk for the next iteration
          incompleteChunk = textToParse.substring(processedUpTo);
        }
      } catch (streamError) {
        console.error(`Error processing stream:`, streamError);
        throw streamError;
      } finally {
        console.log(`Finished processing streaming response for iteration ${iterationNumber}`);
      }
    }
    
    // Start processing the stream
    await processStream();
    
    // Return the full analysis text
    return analysisText;
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
): Promise<string> {
  // Initialize lastUpdateTime to track database updates
  let lastUpdateTime = Date.now();
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
    // Initialize a string to collect the analysis text and reasoning text
    let finalAnalysis = '';
    let finalReasoning = '';
    let chunkSequence = 0;
    
    // Create temporary results object for updates during streaming
    let temporaryResults = {
      analysis: '',
      reasoning: '',
      data: []
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
        model: "deepseek/deepseek-r1",
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
              // Check for delta content
              if (jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                const content = jsonData.choices[0].delta.content;
                
                // Append to the full analysis text
                finalAnalysis += content;
              }
              
              // Check for delta reasoning
              if (jsonData.choices[0].delta && jsonData.choices[0].delta.reasoning) {
                const reasoning = jsonData.choices[0].delta.reasoning;
                
                // Append to the full reasoning text
                finalReasoning += reasoning;
              }
              
              // Or check if we have full message object
              if (jsonData.choices[0].message) {
                if (jsonData.choices[0].message.content) {
                  finalAnalysis += jsonData.choices[0].message.content;
                }
                
                if (jsonData.choices[0].message.reasoning) {
                  finalReasoning += jsonData.choices[0].message.reasoning;
                }
              }
              
              // Increment chunk sequence
              chunkSequence++;
              
              // Update the temporary results
              temporaryResults.analysis = finalAnalysis;
              temporaryResults.reasoning = finalReasoning;
              
              // Update the results in the database every few chunks to avoid too many updates
              if (chunkSequence % 5 === 0) {
                try {
                  // Update the research_job with intermediate results
                  await supabaseClient.rpc('update_research_results', {
                    job_id: jobId,
                    result_data: JSON.stringify(temporaryResults)
                  });
                  
                  console.log(`Updated results with streaming chunk ${chunkSequence}`);
                } catch (updateError) {
                  console.error(`Error updating results with streaming chunk:`, updateError);
                }
              }
            }
          } catch (parseError) {
            console.error(`Error parsing JSON in streaming chunk: ${parseError.message}`);
            console.error(`Problem JSON data: ${data}`);
            // Continue processing other chunks even if one fails
          }
        }
      }
      
      // Save any incomplete chunk for the next iteration
      incompleteChunk = textToParse.substring(processedUpTo);
    }
    
    console.log(`Final analysis streaming complete, total chunks: ${chunkSequence}`);
    
    // Make sure to update the results one final time after streaming is complete
    try {
      await supabaseClient.rpc('update_research_results', {
        job_id: jobId,
        result_data: JSON.stringify({
          ...temporaryResults,
          analysis: finalAnalysis,
          reasoning: finalReasoning
        })
      });
      console.log(`Updated final results after streaming completion`);
    } catch (finalUpdateError) {
      console.error(`Error updating final results after streaming:`, finalUpdateError);
    }
    
    // Return the full analysis text
    return finalAnalysis;
  } catch (error) {
    console.error(`Error in streaming final analysis generation:`, error);
    // Don't throw the error, return what we have so far to allow the process to continue
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

// Function to extract structured insights from analysis
async function extractResearchInsights(
  jobId: string,
  webContent: string,
  analysis: string,
  marketQuestion: string,
  focusText?: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  previousAnalyses?: string[]
): Promise<any> {
  try {
    console.log(`Extracting structured insights for job ${jobId}`);
    
    // Call the extract-research-insights function
    const extractInsightsResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          webContent,
          analysis,
          marketId: null, // Not needed for this function
          marketQuestion,
          previousAnalyses,
          focusText,
          marketPrice,
          relatedMarkets
        })
      }
    );
    
    if (!extractInsightsResponse.ok) {
      const errorText = await extractInsightsResponse.text();
      console.error(`Error extracting insights: ${extractInsightsResponse.status} - ${errorText}`);
      return null;
    }
    
    const insightsResult = await extractInsightsResponse.json();
    console.log(`Successfully extracted insights for job ${jobId}`);
    
    return insightsResult.choices[0].message.content;
  } catch (error) {
    console.error(`Error extracting research insights:`, error);
    return null;
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
    let marketPrice: number | undefined;
    let relatedMarkets: any[] | undefined;
    
    try {
      const { data: marketData, error: marketError } = await supabaseClient
        .from('markets')
        .select('question, market_data')
        .eq('id', marketId)
        .single();
        
      if (!marketError && marketData) {
        if (marketData.question) {
          marketQuestion = marketData.question;
          console.log(`Retrieved market question: "${marketQuestion}"`);
        }
        
        // Extract market price and related markets if available
        if (marketData.market_data) {
          if (typeof marketData.market_data === 'string') {
            try {
              const parsedData = JSON.parse(marketData.market_data);
              if (parsedData.bestAsk !== undefined) {
                marketPrice = parsedData.bestAsk;
              }
              if (parsedData.relatedMarkets && Array.isArray(parsedData.relatedMarkets)) {
                relatedMarkets = parsedData.relatedMarkets;
              }
            } catch (parseError) {
              console.error('Error parsing market_data:', parseError);
            }
          } else if (typeof marketData.market_data === 'object') {
            if (marketData.market_data.bestAsk !== undefined) {
              marketPrice = marketData.market_data.bestAsk;
            }
            if (marketData.market_data.relatedMarkets && Array.isArray(marketData.market_data.relatedMarkets)) {
              relatedMarkets = marketData.market_data.relatedMarkets;
            }
          }
        }
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
    // Track all previous analyses
    const previousAnalyses: string[] = [];
    // Track areas for further research
    const areasForResearch: string[] = [];
    // Track all results for final analysis
    const allResearchResults: ResearchResult[] = [];
    
    // Perform iterations
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
