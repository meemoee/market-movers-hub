// Utility functions for generating analysis with OpenRouter API

// Function to generate analysis with streaming using OpenRouter
export async function generateAnalysisWithStreaming(
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
  previousAnalyses?: string[],
  modelOverride?: string
): Promise<string> {
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
    
    // Create a new stream for processing response chunks
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Use the provided model or default to Gemini 2.5 Pro
    const model = modelOverride || "google/gemini-2.5-pro-preview-03-25";
    console.log(`Using model: ${model} for analysis generation`);
    
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
        model: model,
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
                
                if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                  const content = jsonData.choices[0].delta.content;
                  
                  // Append to the full analysis text
                  analysisText += content;
                  
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
                      // Update the analysis for this iteration
                      updatedIterations[currentIterationIndex].analysis = analysisText;
                      
                      // Update the database with the new iterations array
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
export async function generateFinalAnalysisWithStreaming(
  supabaseClient: any,
  jobId: string,
  content: string, 
  query: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  areasForResearch?: string[],
  focusText?: string,
  previousAnalyses?: string[],
  modelOverride?: string
): Promise<string> {
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
    // Initialize a string to collect the analysis text
    let finalAnalysis = '';
    let chunkSequence = 0;
    
    // Create temporary results object for updates during streaming
    let temporaryResults = {
      analysis: '',
      data: []
    };
    
    // Use the provided model or default to Gemini 2.5 Pro
    const model = modelOverride || "google/gemini-2.5-pro-preview-03-25";
    console.log(`Using model: ${model} for final analysis generation`);
    
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
        model: model,
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
            
            if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
              const content = jsonData.choices[0].delta.content;
              
              // Append to the full analysis text
              finalAnalysis += content;
              
              // Increment chunk sequence
              chunkSequence++;
              
              // Update the temporary results
              temporaryResults.analysis = finalAnalysis;
              
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
    
    // Return the full analysis text
    return finalAnalysis;
  } catch (error) {
    console.error(`Error in streaming final analysis generation:`, error);
    throw error;
  }
}

// Function to parse unstructured analysis into structured format using Gemini 2.5 Flash
export async function parseAnalysisToStructuredFormat(
  analysisText: string,
  query: string,
  marketPrice?: number,
  relatedMarkets?: any[],
  focusText?: string
): Promise<any> {
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
  
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment');
  }
  
  console.log(`Parsing analysis to structured format using Gemini 2.5 Flash`);
  
  // Limit content length to avoid token limits
  const contentLimit = 30000;
  const truncatedAnalysis = analysisText.length > contentLimit 
    ? analysisText.substring(0, contentLimit) + "... [content truncated]" 
    : analysisText;
  
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
  
  // Add focus text section if provided
  let focusSection = '';
  if (focusText && focusText.trim()) {
    focusSection = `\nFOCUS AREA: "${focusText.trim()}"\n
Your analysis must specifically address and deeply analyze this focus area. Connect all insights to this focus.`;
  }
  
  const systemPrompt = `You are an expert market research analyst and probabilistic forecaster.
Your task is to analyze the provided analysis text and generate precise probability estimates based on concrete evidence.

CRITICAL GUIDELINES FOR PROBABILITY ASSESSMENT:
1. Historical Precedents: Always cite specific historical events, statistics, or past occurrences that inform your estimate
2. Key Conditions: Identify and analyze the specific conditions that must be met for the event to occur
3. Impact Factors: List the major factors that could positively or negatively impact the probability
4. Evidence Quality: Assess the reliability and relevance of your sources
5. Uncertainty: Acknowledge key areas of uncertainty and how they affect your estimate
6. Competitive Analysis: When relevant, analyze competitor positions and market dynamics
7. Timeline Considerations: Account for time-dependent factors and how they affect probability
${focusText ? `8. FOCUS AREA: Every evidence point MUST explicitly connect to the focus area: "${focusText}". Prioritize evidence that directly addresses this specific aspect.\n` : ''}

Format your analysis as a JSON object with:
{
  "probability": "X%" (numerical percentage with % sign),
  "areasForResearch": ["area 1", "area 2", "area 3", ...] (specific research areas as an array of strings),
  "reasoning": {
    "evidenceFor": [
      "Detailed point 1 supporting the event happening, with specific examples, statistics, or historical precedents${focusText ? ` that directly addresses the focus area: "${focusText}"` : ''}",
      "Detailed point 2 supporting the event happening"
      // Add multiple points as needed
    ],
    "evidenceAgainst": [
      "Detailed point 1 against the event happening, with specific examples, statistics, or historical precedents${focusText ? ` that directly addresses the focus area: "${focusText}"` : ''}",
      "Detailed point 2 against the event happening"
      // Add multiple points as needed
    ]
  }
}`;

  const userPrompt = `Here is the analysis I've generated about the query: "${query}"

ANALYSIS TEXT:
---
${truncatedAnalysis}
---

${contextInfo}
${focusSection}

Based on this analysis, please provide:
1. A specific probability estimate for the query
2. The key areas where more research is needed
3. A detailed reasoning section with:
   - Evidence FOR the event happening (with specific examples, statistics, historical precedents)
   - Evidence AGAINST the event happening (with specific examples, statistics, historical precedents)

Remember to format your response as a valid JSON object with probability, areasForResearch, and reasoning fields.`;

  try {
    // Use Gemini 2.5 Flash specifically for structured parsing
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
        "X-Title": "Market Research App",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-preview",
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    // Parse the response
    const responseData = await response.json();
    
    // Extract the structured content
    const structuredContent = responseData.choices[0].message.content;
    
    // If it's a string (JSON string), parse it
    let parsedContent;
    if (typeof structuredContent === 'string') {
      parsedContent = JSON.parse(structuredContent);
    } else {
      // If it's already an object, use it directly
      parsedContent = structuredContent;
    }
    
    console.log(`Successfully parsed analysis to structured format with probability: ${parsedContent.probability}`);
    
    return parsedContent;
  } catch (error) {
    console.error(`Error parsing analysis to structured format:`, error);
    
    // Return a basic error object
    return {
      probability: "Error: Failed to generate",
      areasForResearch: ["Error occurred during structured parsing"],
      reasoning: {
        evidenceFor: ["Error parsing analysis"],
        evidenceAgainst: ["Error parsing analysis"]
      },
      error: error.message
    };
  }
}
