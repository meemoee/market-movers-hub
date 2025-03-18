import { corsHeaders } from '../_shared/cors.ts';
import { OpenRouter } from './openRouter.ts';

interface ResearchReport {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  analysis: string;
  conclusion: string;
}

interface ResearchStep {
  query: string;
  results: string;
}

// Default model to use
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { description, marketId, iterations = 3 } = await req.json();
    
    if (!description) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing market description' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Starting deep research for market ${marketId}`);
    console.log(`Description: ${description.substring(0, 100)}...`);
    console.log(`Iterations: ${iterations}`);

    const transformStream = new TransformStream();
    const writer = transformStream.writable.getWriter();
    
    // Start research in background and stream results
    EdgeRuntime.waitUntil((async () => {
      try {
        const openRouter = new OpenRouter(Deno.env.get("OPENROUTER_API_KEY") || "");
        const model = DEFAULT_MODEL;

        // Initialize research state
        const researchState = {
          intent: description,
          model,
          totalIterations: iterations,
          iteration: 1,
          findings: [],
          previousQueries: [],
          steps: [] as ResearchStep[]
        };
        
        // Formulate initial strategic query
        const initialQuery = await formInitialQuery(description, model, openRouter);
        let currentQuery = initialQuery;
        
        researchState.steps.push({
          query: initialQuery,
          results: "Initial query formulated. Starting research..."
        });
        
        console.log(`Initial query: ${initialQuery}`);
        
        // Write initial state to stream
        await writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify({
            success: true,
            report: null,
            steps: researchState.steps,
            isComplete: false
          })}\n\n`)
        );
        
        // Main research loop
        while (researchState.iteration <= iterations) {
          console.log(`Performing iteration ${researchState.iteration}/${iterations}`);
          
          // Perform research with streaming
          await performResearch(currentQuery, researchState, openRouter, writer);
          
          // Check if research should continue
          if (researchState.iteration >= iterations) {
            break;
          }
          
          // Generate next query based on findings
          currentQuery = await generateNextQuery(
            description, 
            researchState.previousQueries, 
            researchState.findings[researchState.findings.length - 1]?.keyFindings || [], 
            model,
            openRouter
          );
          
          researchState.steps.push({
            query: currentQuery,
            results: "Generated follow-up query based on findings."
          });
          
          // Write updated state to stream
          await writer.write(
            new TextEncoder().encode(`data: ${JSON.stringify({
              success: true,
              report: null,
              steps: researchState.steps,
              isComplete: false
            })}\n\n`)
          );
          
          // Increment iteration counter
          researchState.iteration++;
        }
        
        // Generate final report
        console.log("Generating final report");
        const finalReport = await generateFinalReport(researchState, openRouter);
        
        researchState.steps.push({
          query: "Final synthesis",
          results: "Generating comprehensive research report."
        });
        
        console.log("Research completed successfully");
        
        // Write final result to stream
        await writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify({
            success: true,
            report: finalReport,
            steps: researchState.steps,
            isComplete: true
          })}\n\n`)
        );
        
        await writer.write(new TextEncoder().encode(`data: [DONE]\n\n`));
      } catch (error) {
        console.error(`Error in deep-research stream: ${error.message}`);
        await writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify({ 
            success: false, 
            error: `Error in deep-research: ${error.message}`,
            isComplete: true
          })}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })());
    
    return new Response(transformStream.readable, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
    
  } catch (error) {
    console.error(`Error in deep-research function: ${error.message}`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Internal server error: ${error.message}` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

/**
 * Formulate an optimal initial query based on research intent
 */
async function formInitialQuery(intent: string, model: string, openRouter: OpenRouter): Promise<string> {
  console.log(`Formulating strategic initial query...`);
  
  try {
    const systemPrompt = `You are an expert search query formulator. Create the most effective initial search query that will:
1. Target the most essential information about the topic
2. Be specific enough to find relevant results
3. Use 5-10 words maximum with precise terminology

Return ONLY the query text with no explanations or formatting.`;

    const response = await openRouter.complete(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create the best initial search query for: "${intent}"` }
    ], 60, 0.3);

    const initialQuery = response.replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    console.log(`Initial query formulated: "${initialQuery}"`);
    return initialQuery;
  } catch (error) {
    console.error(`Failed to formulate initial query: ${error.message}`);
    return intent; // Fall back to original intent
  }
}

/**
 * Generate a strategic follow-up query based on findings
 */
async function generateNextQuery(
  intent: string, 
  previousQueries: string[], 
  keyFindings: string[], 
  model: string,
  openRouter: OpenRouter
): Promise<string> {
  console.log(`Generating strategic follow-up query...`);
  
  const recentFindings = keyFindings
    .slice(-3)
    .map((f, i) => `${i+1}. ${f}`)
    .join('\n');
    
  const previousQueriesText = previousQueries
    .slice(-3)
    .map((q, i) => `${i+1}. "${q}"`)
    .join('\n');
  
  try {
    const systemPrompt = `You generate strategic follow-up search queries for research. 
RESPOND WITH ONLY THE QUERY TEXT - NO EXPLANATIONS OR QUOTES.`;

    const userPrompt = `RESEARCH QUESTION: "${intent}"

PREVIOUS QUERIES:
${previousQueriesText}

RECENT FINDINGS:
${recentFindings}

Based on what we've learned, create the MOST EFFECTIVE follow-up search query that will:

1. Focus on the most important remaining unknown aspect
2. Be different enough from previous queries
3. Use precise language that would appear in relevant sources
4. Contain 5-10 words maximum
5. Help directly answer the original research question

Return only the query text with no explanations.`;

    const response = await openRouter.complete(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 60, 0.4);

    const nextQuery = response.replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    console.log(`Follow-up query generated: "${nextQuery}"`);
    return nextQuery;
  } catch (error) {
    console.error(`Query generation failed: ${error.message}`);
    // Simple fallback strategy
    return `${intent.split(' ').slice(0, 3).join(' ')} additional information`;
  }
}

/**
 * Perform a research iteration with streaming
 */
async function performResearch(query: string, researchState: any, openRouter: OpenRouter, writer: WritableStreamDefaultWriter) {
  console.log(`[Iteration ${researchState.iteration}/${researchState.totalIterations}] Searching: "${query}"`);
  
  // Create a brief research context from previous findings
  let researchContext = '';
  if (researchState.findings.length > 0) {
    const previousFindings = researchState.findings
      .slice(-1)[0]
      .keyFindings
      .slice(0, 3)
      .map((f: string, i: number) => `${i+1}. ${f}`)
      .join('\n');
      
    if (previousFindings) {
      researchContext = `\nPREVIOUS FINDINGS:\n${previousFindings}`;
    }
  }
  
  // System prompt
  const systemPrompt = `You are a precise research assistant investigating: "${researchState.intent}"

Current iteration: ${researchState.iteration} of ${researchState.totalIterations}
Current query: "${query}"
${researchContext}

Your task is to:
1. Search for and analyze information relevant to the query
2. Identify NEW facts and information about the topic
3. Focus on directly answering the original research question
4. Provide specific, detailed, factual information
5. CITE SOURCES using markdown links [title](url) whenever possible

RESPOND IN THIS FORMAT:
1. First, provide a DETAILED ANALYSIS of the search results (1-2 paragraphs)
2. Then, list KEY FINDINGS as numbered points (precise, specific facts)
3. ${researchState.iteration < researchState.totalIterations ? 'Finally, state the most important unanswered question based on these findings' : 'Finally, provide a comprehensive SUMMARY of all findings related to the original question'}

IMPORTANT:
- Focus on NEW information in each iteration
- Be objective and factual
- Cite sources wherever possible 
- Make each key finding specific and self-contained`;

  try {
    // The ":online" suffix is for web search, if available on OpenRouter
    const onlineModel = `${researchState.model}:online`;
    
    // Use streaming for the request
    const response = await openRouter.completeStreaming(onlineModel, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Search for information on: "${query}"` }
    ], 1200, 0.3);
    
    // Initialize result data structure
    const result = {
      iteration: researchState.iteration,
      query,
      analysis: '',
      keyFindings: [] as string[],
      importantQuestion: '',
      finalSummary: '',
      sources: [] as {url: string, label: string}[],
      error: false
    };
    
    // Process the stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          
          if (jsonStr === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              accumulatedContent += content;
              
              // Process partial content to extract structured data
              const partialResult = processContent(accumulatedContent, query);
              
              // Update result with partial data
              result.analysis = partialResult.analysis;
              result.keyFindings = partialResult.keyFindings;
              result.importantQuestion = partialResult.importantQuestion;
              result.finalSummary = partialResult.finalSummary;
              result.sources = partialResult.sources;
              
              // Stream current state to client
              researchState.steps[researchState.steps.length - 1] = {
                query,
                results: `Analysis in progress... Found ${result.keyFindings.length} key findings so far.`
              };
              
              await writer.write(
                new TextEncoder().encode(`data: ${JSON.stringify({
                  success: true,
                  currentIteration: {
                    iteration: researchState.iteration,
                    analysis: result.analysis,
                    keyFindings: result.keyFindings,
                    query
                  },
                  steps: researchState.steps,
                  isComplete: false
                })}\n\n`)
              );
            }
          } catch (e) {
            console.error(`Error parsing SSE data: ${e}`);
          }
        }
      }
    }
    
    // Store final results
    const finalResult = processContent(accumulatedContent, query);
    finalResult.iteration = researchState.iteration;
    
    researchState.findings.push(finalResult);
    researchState.previousQueries.push(query);
    
    researchState.steps[researchState.steps.length - 1] = {
      query,
      results: `Research completed. Found ${finalResult.keyFindings.length} key findings.`
    };
    
    return finalResult;
  } catch (error) {
    console.error(`Research failed: ${error.message}`);
    // Try again without the :online suffix if it failed
    try {
      console.log("Retrying without web search...");
      const response = await openRouter.complete(researchState.model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Based on your knowledge, provide information on: "${query}"` }
      ], 1200, 0.3);
      
      // Process the content to extract structured data
      const result = processContent(response, query);
      result.iteration = researchState.iteration;
      
      researchState.findings.push(result);
      researchState.previousQueries.push(query);
      
      researchState.steps[researchState.steps.length - 1] = {
        query,
        results: `Research completed (fallback method). Found ${result.keyFindings.length} key findings.`
      };
      
      return result;
    } catch (retryError) {
      console.error(`Retry also failed: ${retryError.message}`);
      const errorResult = {
        iteration: researchState.iteration,
        query,
        analysis: `Error occurred during research: ${error.message}`,
        keyFindings: ["Error in analysis"],
        importantQuestion: '',
        finalSummary: '',
        sources: [],
        error: true
      };
      
      researchState.findings.push(errorResult);
      researchState.previousQueries.push(query);
      
      researchState.steps[researchState.steps.length - 1] = {
        query,
        results: `Research failed: ${error.message}`
      };
      
      return errorResult;
    }
  }
}

/**
 * Process content to extract structured information
 */
function processContent(content: string, query: string) {
  // Initialize result object
  const result = {
    query,
    analysis: '',
    keyFindings: [] as string[],
    importantQuestion: '',
    finalSummary: '',
    sources: [] as {url: string, label: string}[],
    error: false
  };
  
  try {
    // Extract analysis section (everything before "KEY FINDINGS")
    const analysisSplit = content.split(/KEY FINDINGS/i);
    if (analysisSplit.length > 1) {
      result.analysis = analysisSplit[0].trim();
    } else {
      result.analysis = content.trim();
      return result; // Early return if we can't parse properly
    }
    
    // Extract key findings
    const findingRegex = /\d+\.\s+(.+?)(?=\d+\.|IMPORTANT QUESTION|SUMMARY|$)/gs;
    let restContent = analysisSplit.slice(1).join('KEY FINDINGS');
    let findingMatch;
    
    while ((findingMatch = findingRegex.exec(restContent)) !== null) {
      const finding = findingMatch[1].trim();
      if (finding) {
        result.keyFindings.push(finding);
      }
    }
    
    // Extract important question or final summary
    const questionMatch = content.match(/IMPORTANT QUESTION[:\s]*([^\n]+)/i);
    if (questionMatch && questionMatch[1]) {
      result.importantQuestion = questionMatch[1].trim();
    }
    
    const summaryMatch = content.match(/SUMMARY[:\s]*([\s\S]+)/i);
    if (summaryMatch && summaryMatch[1]) {
      result.finalSummary = summaryMatch[1].trim();
    }
    
    // Extract sources from markdown links
    const sourceRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let sourceMatch;
    
    while ((sourceMatch = sourceRegex.exec(content)) !== null) {
      const [_, label, url] = sourceMatch;
      
      if (url && isValidUrl(url)) {
        result.sources.push({
          url,
          label: label || url
        });
      }
    }
    
    return result;
  } catch (error) {
    console.error(`Content processing failed: ${error.message}`);
    result.error = true;
    return result;
  }
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Generate final research report
 */
async function generateFinalReport(researchState: any, openRouter: OpenRouter): Promise<ResearchReport> {
  console.log('Generating final research synthesis...');
  
  // Prepare findings summary
  const allFindings = researchState.findings
    .flatMap((f: any) => f.keyFindings)
    .map((f: string, i: number) => `${i+1}. ${f}`)
    .join('\n');
  
  // Generate final report
  try {
    const systemPrompt = `You are a research synthesis expert creating a comprehensive final report.`;
    
    const userPrompt = `RESEARCH QUESTION: "${researchState.intent}"

FINDINGS FROM ALL ITERATIONS:
${allFindings}

Create a comprehensive research report with these sections:
1. TITLE - Clear, informative title for the report
2. EXECUTIVE SUMMARY - Brief overview of key conclusions (1-2 paragraphs)
3. KEY FINDINGS - 5-7 most important findings (numbered list)
4. DETAILED ANALYSIS - Comprehensive analysis of findings (2 paragraphs)
5. CONCLUSION - Final answer to the research question (1 paragraph)

Make the report clear, factual, and directly answer the original research question.`;

    const fullReport = await openRouter.complete(researchState.model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 1500, 0.3);
    
    console.log("Final report generated");
    
    // Parse the report into sections
    return parseReportToStructure(fullReport);
  } catch (error) {
    console.error(`Final report generation failed: ${error.message}`);
    
    // Return a basic error report
    return {
      title: "Research Synthesis Error",
      executiveSummary: `Error generating final report: ${error.message}`,
      keyFindings: ["Error occurred during research synthesis"],
      analysis: "Unable to complete research analysis due to an error.",
      conclusion: "Research synthesis failed to complete."
    };
  }
}

/**
 * Parse the full report text into a structured report object
 */
function parseReportToStructure(reportText: string): ResearchReport {
  try {
    // Extract title
    const titleMatch = reportText.match(/^#?\s*(.*?)(?:\n|$)/);
    const title = titleMatch ? titleMatch[1].trim() : "Research Report";
    
    // Extract executive summary
    const execSummaryMatch = reportText.match(/EXECUTIVE SUMMARY:?([\s\S]*?)(?=KEY FINDINGS|$)/i);
    const executiveSummary = execSummaryMatch ? execSummaryMatch[1].trim() : "";
    
    // Extract key findings
    const keyFindingsMatch = reportText.match(/KEY FINDINGS:?([\s\S]*?)(?=DETAILED ANALYSIS|ANALYSIS|$)/i);
    let keyFindings: string[] = [];
    
    if (keyFindingsMatch && keyFindingsMatch[1]) {
      const findingsText = keyFindingsMatch[1].trim();
      const findingRegex = /\d+\.\s+(.+?)(?=\d+\.|$)/gs;
      let findingMatch;
      
      while ((findingMatch = findingRegex.exec(findingsText)) !== null) {
        keyFindings.push(findingMatch[1].trim());
      }
    }
    
    // Extract analysis
    const analysisMatch = reportText.match(/(?:DETAILED ANALYSIS|ANALYSIS):?([\s\S]*?)(?=CONCLUSION|$)/i);
    const analysis = analysisMatch ? analysisMatch[1].trim() : "";
    
    // Extract conclusion
    const conclusionMatch = reportText.match(/CONCLUSION:?([\s\S]*?)(?=LIMITATIONS|FURTHER RESEARCH|$)/i);
    const conclusion = conclusionMatch ? conclusionMatch[1].trim() : "";
    
    // If we couldn't parse the sections properly, use a simpler approach
    if (!executiveSummary && !analysis && !conclusion) {
      const parts = reportText.split('\n\n');
      
      return {
        title: title,
        executiveSummary: parts[0] || "Research completed.",
        keyFindings: keyFindings.length > 0 ? keyFindings : ["No specific findings extracted"],
        analysis: parts.length > 1 ? parts[1] : "Analysis not available.",
        conclusion: parts.length > 2 ? parts[2] : "See executive summary."
      };
    }
    
    return {
      title,
      executiveSummary,
      keyFindings: keyFindings.length > 0 ? keyFindings : ["No structured findings available"],
      analysis,
      conclusion
    };
  } catch (error) {
    console.error(`Error parsing report structure: ${error.message}`);
    
    // Return a basic structure if parsing fails
    return {
      title: "Research Synthesis",
      executiveSummary: "A synthesis of the research findings.",
      keyFindings: ["Error parsing structured findings"],
      analysis: "Error parsing analysis section.",
      conclusion: "See executive summary."
    };
  }
}
