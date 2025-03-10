import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { OpenRouter } from "./openRouter.ts"

interface ResearchReport {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  analysis: string;
  conclusion: string;
  queryEffectiveness: number;
  focusAreaSuggestions: string[];
  patternAnalysis: {
    effectivePatterns: string[];
    ineffectivePatterns: string[];
  };
}

interface ResearchStep {
  query: string;
  results: string;
  effectiveness?: number;
  timestamp?: string;
  focusArea?: string;
}

interface QueryPattern {
  template: string;
  effectiveness: number;
  occurrences: number;
  examples: string[];
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
    const { description, marketId, iterations = 3, focusText, previousResearch } = await req.json();
    
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
    console.log(`Focus text: ${focusText || 'None provided'}`);
    console.log(`Previous research: ${previousResearch ? 'Provided' : 'Not provided'}`);

    const openRouter = new OpenRouter(Deno.env.get("OPENROUTER_API_KEY") || "");
    const model = DEFAULT_MODEL;

    // Initialize research state
    const researchState = {
      intent: description,
      model,
      focusArea: focusText || null,
      totalIterations: iterations,
      iteration: 1,
      findings: [],
      previousQueries: [],
      ineffectiveQueries: [],
      steps: [] as ResearchStep[],
      queryPatterns: [] as QueryPattern[],
      previousResearchContext: previousResearch || null,
      contextVector: null as number[] | null
    };
    
    // If we have focus text, generate an embedding for contextual similarity tracking
    if (focusText) {
      try {
        researchState.contextVector = await openRouter.generateEmbedding(focusText);
        console.log(`Generated context vector for focus: ${focusText}`);
      } catch (err) {
        console.warn("Could not generate embedding:", err.message);
      }
    }
    
    // Formulate initial strategic query
    const initialQuery = await formInitialQuery(description, focusText, model, openRouter);
    let currentQuery = initialQuery;
    
    researchState.steps.push({
      query: initialQuery,
      results: "Initial query formulated. Starting research...",
      focusArea: focusText
    });
    
    console.log(`Initial query: ${initialQuery}`);
    
    // Extract query patterns from previous research if available
    if (previousResearch && previousResearch.queryPatterns) {
      researchState.queryPatterns = previousResearch.queryPatterns;
      console.log(`Loaded ${researchState.queryPatterns.length} query patterns from previous research`);
    }
    
    // Main research loop
    while (researchState.iteration <= iterations) {
      console.log(`Performing iteration ${researchState.iteration}/${iterations}`);
      
      // Perform research
      const result = await performResearch(currentQuery, researchState, openRouter);
      
      // Store results and update effectiveness tracking
      researchState.findings.push(result);
      researchState.previousQueries.push({
        query: currentQuery,
        effectiveness: result.effectiveness || 0
      });
      
      if (result.effectiveness && result.effectiveness < 4) {
        researchState.ineffectiveQueries.push(currentQuery);
      }
      
      // Update query patterns
      updateQueryPatterns(currentQuery, result.effectiveness || 5, researchState.queryPatterns);
      
      researchState.steps.push({
        query: currentQuery,
        results: `Research completed. Found ${result.keyFindings.length} key findings.`,
        effectiveness: result.effectiveness,
        timestamp: new Date().toISOString()
      });
      
      // Check if research should continue
      if (researchState.iteration >= iterations || result.error) {
        break;
      }
      
      // Generate next query based on findings
      currentQuery = await generateNextQuery(
        description, 
        researchState.previousQueries, 
        result.keyFindings, 
        model,
        openRouter,
        focusText,
        researchState.ineffectiveQueries
      );
      
      researchState.steps.push({
        query: currentQuery,
        results: "Generated follow-up query based on findings.",
        focusArea: focusText
      });
      
      // Increment iteration counter
      researchState.iteration++;
    }
    
    // Generate final report
    console.log("Generating final report");
    const finalReport = await generateFinalReport(researchState, openRouter);
    
    researchState.steps.push({
      query: "Final synthesis",
      results: "Generating comprehensive research report.",
      timestamp: new Date().toISOString()
    });
    
    console.log("Research completed successfully");
    
    return new Response(
      JSON.stringify({
        success: true,
        report: finalReport,
        steps: researchState.steps,
        queryPatterns: researchState.queryPatterns,
        focusArea: focusText
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
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
 * Update query patterns based on a new query and its effectiveness
 */
function updateQueryPatterns(
  query: string,
  effectiveness: number, 
  queryPatterns: QueryPattern[]
): void {
  // Extract a template pattern from the query
  const words = query.split(/\s+/);
  let template = "";
  
  if (words.length >= 4) {
    // Create a template by replacing specific terms with placeholders
    template = words.map(w => {
      // Replace specific entities with placeholders but keep structural words
      return w.length > 5 && /^[A-Z]/.test(w) ? '{ENTITY}' : 
             w.length > 7 ? '{TERM}' : w;
    }).join(' ');
  } else {
    // For short queries, use the whole query as template
    template = query;
  }
  
  // Find if we already have this pattern
  const existingPatternIndex = queryPatterns.findIndex(p => p.template === template);
  
  if (existingPatternIndex >= 0) {
    // Update existing pattern
    const pattern = queryPatterns[existingPatternIndex];
    pattern.occurrences += 1;
    pattern.effectiveness = (pattern.effectiveness * pattern.occurrences + effectiveness) / (pattern.occurrences + 1);
    
    // Add this query as an example if we don't have too many
    if (pattern.examples.length < 5 && !pattern.examples.includes(query)) {
      pattern.examples.push(query);
    }
  } else {
    // Add new pattern
    queryPatterns.push({
      template,
      effectiveness,
      occurrences: 1,
      examples: [query]
    });
  }
}

/**
 * Formulate an optimal initial query based on research intent
 */
async function formInitialQuery(
  intent: string, 
  focusText: string | null, 
  model: string, 
  openRouter: OpenRouter
): Promise<string> {
  console.log(`Formulating strategic initial query...`);
  
  try {
    const systemPrompt = `You are an expert search query formulator. Create the most effective initial search query that will:
1. Target the most essential information about the topic
2. Be specific enough to find relevant results
3. Use 5-10 words maximum with precise terminology
${focusText ? `4. Focus specifically on the aspect: "${focusText}"` : ''}

Return ONLY the query text with no explanations or formatting.`;

    const userPrompt = `Create the best initial search query for: "${intent}"${
      focusText ? `\nWith specific focus on: "${focusText}"` : ''
    }`;

    const response = await openRouter.complete(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 60, 0.3);

    const initialQuery = response.replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    console.log(`Initial query formulated: "${initialQuery}"`);
    return initialQuery;
  } catch (error) {
    console.error(`Failed to formulate initial query: ${error.message}`);
    return focusText ? `${intent} ${focusText}` : intent; // Fall back to original intent
  }
}

/**
 * Generate a strategic follow-up query based on findings
 */
async function generateNextQuery(
  intent: string, 
  previousQueries: { query: string; effectiveness: number }[], 
  keyFindings: string[], 
  model: string,
  openRouter: OpenRouter,
  focusText: string | null = null,
  ineffectiveQueries: string[] = []
): Promise<string> {
  console.log(`Generating strategic follow-up query...`);
  
  const recentFindings = keyFindings
    .slice(-3)
    .map((f, i) => `${i+1}. ${f}`)
    .join('\n');
    
  const previousQueriesText = previousQueries
    .slice(-3)
    .map((q, i) => `${i+1}. "${q.query}" (effectiveness: ${q.effectiveness}/10)`)
    .join('\n');
    
  const ineffectiveQueriesText = ineffectiveQueries.length > 0 
    ? `\n\nINEFFECTIVE QUERIES TO AVOID PATTERNS FROM:\n${ineffectiveQueries.slice(-2).map(q => `- ${q}`).join('\n')}`
    : '';
  
  try {
    const systemPrompt = `You generate strategic follow-up search queries for research. 
RESPOND WITH ONLY THE QUERY TEXT - NO EXPLANATIONS OR QUOTES.`;

    const userPrompt = `RESEARCH QUESTION: "${intent}"
${focusText ? `FOCUS AREA: "${focusText}"` : ''}

PREVIOUS QUERIES:
${previousQueriesText}
${ineffectiveQueriesText}

RECENT FINDINGS:
${recentFindings}

Based on what we've learned, create the MOST EFFECTIVE follow-up search query that will:

1. Focus on the most important remaining unknown aspect
2. Be different enough from previous queries
3. Use precise language that would appear in relevant sources
4. Contain 5-10 words maximum
5. Help directly answer the original research question
${focusText ? `6. Maintain specific focus on the area: "${focusText}"` : ''}

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
    if (focusText) {
      return `${intent.split(' ').slice(0, 3).join(' ')} ${focusText} additional information`;
    }
    return `${intent.split(' ').slice(0, 3).join(' ')} additional information`;
  }
}

/**
 * Perform a research iteration
 */
async function performResearch(query: string, researchState: any, openRouter: OpenRouter) {
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
  
  // Add focus area context if available
  const focusContext = researchState.focusArea 
    ? `\nFOCUS AREA: "${researchState.focusArea}"\nKeep research tightly focused on this specific aspect.`
    : '';
  
  // System prompt
  const systemPrompt = `You are a precise research assistant investigating: "${researchState.intent}"

Current iteration: ${researchState.iteration} of ${researchState.totalIterations}
Current query: "${query}"${focusContext}${researchContext}

Your task is to:
1. Search for and analyze information relevant to the query
2. Identify NEW facts and information about the topic
3. Focus on directly answering the original research question
4. Provide specific, detailed, factual information
5. CITE SOURCES using markdown links [title](url) whenever possible
6. ASSIGN AN EFFECTIVENESS SCORE (1-10) for how well this query answered important questions

RESPOND IN THIS FORMAT:
1. First, provide a DETAILED ANALYSIS of the search results (1-2 paragraphs)
2. Then, list KEY FINDINGS as numbered points (precise, specific facts)
3. ${researchState.iteration < researchState.totalIterations ? 'Next, state the most important unanswered question based on these findings' : 'Next, provide a comprehensive SUMMARY of all findings related to the original question'}
4. Finally, score this query's EFFECTIVENESS (1-10) with brief explanation

IMPORTANT:
- Focus on NEW information in each iteration
- Be objective and factual
- Cite sources wherever possible 
- Make each key finding specific and self-contained`;

  try {
    // The ":online" suffix is for web search, if available on OpenRouter
    const onlineModel = `${researchState.model}:online`;
    
    const response = await openRouter.complete(onlineModel, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Search for information on: "${query}"` }
    ], 1200, 0.3);
    
    // Process the content to extract structured data
    const result = processContent(response, query);
    result.iteration = researchState.iteration;
    
    return result;
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
      
      return result;
    } catch (retryError) {
      console.error(`Retry also failed: ${retryError.message}`);
      return {
        iteration: researchState.iteration,
        query,
        analysis: `Error occurred during research: ${error.message}`,
        keyFindings: ["Error in analysis"],
        importantQuestion: '',
        finalSummary: '',
        sources: [],
        effectiveness: 1,
        error: true
      };
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
    effectiveness: 0,
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
    const findingRegex = /\d+\.\s+(.+?)(?=\d+\.|IMPORTANT QUESTION|UNANSWERED QUESTION|SUMMARY|EFFECTIVENESS|$)/gs;
    let restContent = analysisSplit.slice(1).join('KEY FINDINGS');
    let findingMatch;
    
    while ((findingMatch = findingRegex.exec(restContent)) !== null) {
      const finding = findingMatch[1].trim();
      if (finding) {
        result.keyFindings.push(finding);
      }
    }
    
    // Extract important question or final summary
    const questionMatch = content.match(/(?:IMPORTANT|UNANSWERED) QUESTION[:\s]*([^\n]+)/i);
    if (questionMatch && questionMatch[1]) {
      result.importantQuestion = questionMatch[1].trim();
    }
    
    const summaryMatch = content.match(/SUMMARY[:\s]*([\s\S]+?)(?=EFFECTIVENESS|$)/i);
    if (summaryMatch && summaryMatch[1]) {
      result.finalSummary = summaryMatch[1].trim();
    }
    
    // Extract effectiveness score
    const effectivenessMatch = content.match(/EFFECTIVENESS[:\s]*(\d+)/i);
    if (effectivenessMatch && effectivenessMatch[1]) {
      result.effectiveness = parseFloat(effectivenessMatch[1]);
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
  console.log('Generating final research report...');
  
  try {
    // Combine all findings for the synthesis
    const allFindings = researchState.findings
      .reduce((acc: string[], result: any) => [
        ...acc, 
        ...(result.keyFindings || [])
      ], []);
    
    // Get all analyses
    const allAnalyses = researchState.findings
      .map((result: any) => result.analysis || '')
      .filter((a: string) => a.length > 0)
      .join('\n\n');
    
    // Create a consolidated analysis for the report
    const focusText = researchState.focusArea ? 
      `\nFOCUS AREA: "${researchState.focusArea}"\n` : '';
      
    const systemPrompt = `You are a research analyst synthesizing findings into a comprehensive report. 
Create a well-structured research report with these sections:
1. TITLE - A concise descriptive title for the research
2. EXECUTIVE SUMMARY - A brief overview of the key conclusions (2-3 sentences)
3. KEY FINDINGS - The 5-7 most important facts and insights, listed as numbered points
4. ANALYSIS - A thorough analysis of all information (2-3 paragraphs)
5. CONCLUSION - Final conclusions on probability and confidence (1 paragraph)
6. QUERY EFFECTIVENESS - Score from 1-10 how well the queries answered the research question
7. FOCUS AREA SUGGESTIONS - 3-5 specific aspects worth investigating further
8. PATTERN ANALYSIS - Identify which query approaches worked or didn't work

Your report should be objective, factual, and focused on directly addressing: "${researchState.intent}"
${focusText}`;

    const userPrompt = `
Here's all the research data to synthesize:

ANALYSES:
${allAnalyses}

KEY FINDINGS:
${allFindings.map((f: string, i: number) => `${i+1}. ${f}`).join('\n')}

Format your report with clear section headings and concise, focused content.`;

    const reportContent = await openRouter.complete(researchState.model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 1500, 0.3);
    
    // Extract sections from the report
    const report = parseReportSections(reportContent, researchState.intent);
    return report;
  } catch (error) {
    console.error('Error generating final report:', error);
    
    // Create a minimal report in case of error
    return {
      title: `Research on ${researchState.intent}`,
      executiveSummary: "An error occurred while generating the final report.",
      keyFindings: ["Error in report generation"],
      analysis: `Error occurred during final report generation: ${error.message}`,
      conclusion: "Unable to complete research synthesis due to technical error.",
      queryEffectiveness: 0,
      focusAreaSuggestions: [],
      patternAnalysis: {
        effectivePatterns: [],
        ineffectivePatterns: []
      }
    };
  }
}

/**
 * Parse report content into structured sections
 */
function parseReportSections(content: string, fallbackTitle: string): ResearchReport {
  const report: ResearchReport = {
    title: '',
    executiveSummary: '',
    keyFindings: [],
    analysis: '',
    conclusion: '',
    queryEffectiveness: 0,
    focusAreaSuggestions: [],
    patternAnalysis: {
      effectivePatterns: [],
      ineffectivePatterns: []
    }
  };
  
  try {
    // Extract title
    const titleMatch = content.match(/TITLE[:\s]*(.*?)(?=\n|EXECUTIVE SUMMARY)/is);
    report.title = titleMatch?.[1]?.trim() || `Research on ${fallbackTitle}`;
    
    // Extract executive summary
    const summaryMatch = content.match(/EXECUTIVE SUMMARY[:\s]*([\s\S]*?)(?=\n\s*KEY FINDINGS|\n\s*\d+\.)/is);
    report.executiveSummary = summaryMatch?.[1]?.trim() || '';
    
    // Extract key findings
    const findingsSection = content.match(/KEY FINDINGS[:\s]*([\s\S]*?)(?=\n\s*ANALYSIS|\n\s*CONCLUSION)/is);
    if (findingsSection && findingsSection[1]) {
      const findingMatches = findingsSection[1].match(/\d+\.\s*(.*?)(?=\n\s*\d+\.|\n\s*ANALYSIS|\n\s*CONCLUSION|$)/gs);
      report.keyFindings = findingMatches 
        ? findingMatches.map(f => f.replace(/^\d+\.\s*/, '').trim())
        : [];
    }
    
    // Extract analysis
    const analysisMatch = content.match(/ANALYSIS[:\s]*([\s\S]*?)(?=\n\s*CONCLUSION)/is);
    report.analysis = analysisMatch?.[1]?.trim() || '';
    
    // Extract conclusion
    const conclusionMatch = content.match(/CONCLUSION[:\s]*([\s\S]*?)(?=\n\s*QUERY EFFECTIVENESS|\n\s*FOCUS AREA|$)/is);
    report.conclusion = conclusionMatch?.[1]?.trim() || '';
    
    // Extract query effectiveness
    const effectivenessMatch = content.match(/QUERY EFFECTIVENESS[:\s]*(\d+)/i);
    report.queryEffectiveness = effectivenessMatch?.[1] ? parseInt(effectivenessMatch[1]) : 0;
    
    // Extract focus area suggestions
    const focusAreaSection = content.match(/FOCUS AREA SUGGESTIONS[:\s]*([\s\S]*?)(?=\n\s*PATTERN ANALYSIS|$)/is);
    if (focusAreaSection && focusAreaSection[1]) {
      const focusMatches = focusAreaSection[1].match(/(?:\d+\.|[-•])\s*(.*?)(?=\n\s*(?:\d+\.|[-•])|\n\s*PATTERN ANALYSIS|$)/gs);
      report.focusAreaSuggestions = focusMatches 
        ? focusMatches.map(f => f.replace(/^(?:\d+\.|[-•])\s*/, '').trim())
        : [];
    }
    
    // Extract pattern analysis
    const patternSection = content.match(/PATTERN ANALYSIS[:\s]*([\s\S]*?)$/is);
    if (patternSection && patternSection[1]) {
      // Try to find effective and ineffective pattern sections
      const effectivePatterns: string[] = [];
      const ineffectivePatterns: string[] = [];
      
      const effectiveMatch = patternSection[1].match(/(?:EFFECTIVE|WORKED)[:\s]*([\s\S]*?)(?=\n\s*(?:INEFFECTIVE|DIDN'T WORK)|$)/is);
      if (effectiveMatch && effectiveMatch[1]) {
        const patterns = effectiveMatch[1].match(/(?:\d+\.|[-•])\s*(.*?)(?=\n\s*(?:\d+\.|[-•])|$)/gs);
        if (patterns) {
          patterns.forEach(p => {
            const clean = p.replace(/^(?:\d+\.|[-•])\s*/, '').trim();
            if (clean) effectivePatterns.push(clean);
          });
        }
      }
      
      const ineffectiveMatch = patternSection[1].match(/(?:INEFFECTIVE|DIDN'T WORK)[:\s]*([\s\S]*?)$/is);
      if (ineffectiveMatch && ineffectiveMatch[1]) {
        const patterns = ineffectiveMatch[1].match(/(?:\d+\.|[-•])\s*(.*?)(?=\n\s*(?:\d+\.|[-•])|$)/gs);
        if (patterns) {
          patterns.forEach(p => {
            const clean = p.replace(/^(?:\d+\.|[-•])\s*/, '').trim();
            if (clean) ineffectivePatterns.push(clean);
          });
        }
      }
      
      report.patternAnalysis = {
        effectivePatterns,
        ineffectivePatterns
      };
    }
    
    return report;
  } catch (error) {
    console.error('Error parsing report sections:', error);
    
    // Return minimal report with the content as analysis
    return {
      title: `Research on ${fallbackTitle}`,
      executiveSummary: "Error parsing report sections.",
      keyFindings: [],
      analysis: content,
      conclusion: "",
      queryEffectiveness: 0,
      focusAreaSuggestions: [],
      patternAnalysis: {
        effectivePatterns: [],
        ineffectivePatterns: []
      }
    };
  }
}
