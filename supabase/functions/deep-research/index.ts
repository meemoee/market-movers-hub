
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.37.0';
import { cors } from '../_shared/cors.ts';

// Base URL of the OpenRouter API
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Configuration
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const REFERENCE_SITE = 'https://lovable.dev';

// Get Supabase client using environment variables
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

/**
 * Formulate an optimal initial query based on research intent
 */
async function formInitialQuery(intent: string, apiKey: string, model: string) {
  console.log(`Formulating strategic initial query...`);
  
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': REFERENCE_SITE
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: `You are an expert search query formulator. Create the most effective initial search query that will:
1. Target the most essential information about the topic
2. Be specific enough to find relevant results
3. Use 5-10 words maximum with precise terminology

Return ONLY the query text with no explanations or formatting.`
          },
          { 
            role: 'user', 
            content: `Create the best initial search query for: "${intent}"` 
          }
        ],
        max_tokens: 60,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const initialQuery = data.choices[0].message.content.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    console.log(`Initial query formulated: "${initialQuery}"`);
    return initialQuery;
  } catch (error) {
    console.error(`Failed to formulate initial query: ${error}`);
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
  apiKey: string,
  model: string
) {
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
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': REFERENCE_SITE
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: `You generate strategic follow-up search queries for research. 
RESPOND WITH ONLY THE QUERY TEXT - NO EXPLANATIONS OR QUOTES.` 
          },
          { 
            role: 'user', 
            content: `RESEARCH QUESTION: "${intent}"

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

Return only the query text with no explanations.` 
          }
        ],
        max_tokens: 60,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const nextQuery = data.choices[0].message.content.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, ''); // Remove trailing period
    
    console.log(`Follow-up query generated: "${nextQuery}"`);
    return nextQuery;
  } catch (error) {
    console.error(`Query generation failed: ${error}`);
    // Simple fallback strategy
    return `${intent.split(' ').slice(0, 3).join(' ')} additional information`;
  }
}

/**
 * Perform a research iteration
 */
async function performResearch(
  query: string, 
  researchState: any,
  apiKey: string
) {
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
    // Make API request with web search enabled
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': REFERENCE_SITE
      },
      body: JSON.stringify({
        model: `${researchState.model}:online`, // Web search enabled
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Search for information on: "${query}"` }
        ],
        max_tokens: 1200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Process the content to extract structured data
    const result = processContent(content, query, data.citations || []);
    result.iteration = researchState.iteration;
    
    return result;
  } catch (error) {
    console.error(`Research failed: ${error}`);
    return {
      iteration: researchState.iteration,
      query,
      analysis: `Error occurred during research: ${error}`,
      keyFindings: ["Error in analysis"],
      importantQuestion: '',
      finalSummary: '',
      sources: [],
      error: true
    };
  }
}

/**
 * Process content to extract structured information
 */
function processContent(content: string, query: string, citations: string[]) {
  // Initialize result object
  const result = {
    query,
    analysis: '',
    keyFindings: [],
    importantQuestion: '',
    finalSummary: '',
    sources: [],
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
    
    // Add citations from API response if any
    if (citations && citations.length) {
      for (const citation of citations) {
        if (isValidUrl(citation) && !result.sources.some((s: any) => s.url === citation)) {
          result.sources.push({
            url: citation,
            label: citation
          });
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error(`Content processing failed: ${error}`);
    result.error = true;
    return result;
  }
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(url: string) {
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
async function generateFinalReport(researchState: any, apiKey: string) {
  console.log('Generating final research synthesis...');
  
  // Prepare findings summary
  const allFindings = researchState.findings
    .flatMap((f: any) => f.keyFindings)
    .map((f: string, i: number) => `${i+1}. ${f}`)
    .join('\n');
  
  // Generate final report
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': REFERENCE_SITE
      },
      body: JSON.stringify({
        model: researchState.model,
        messages: [
          { 
            role: 'system', 
            content: `You are a research synthesis expert creating a comprehensive final report.` 
          },
          { 
            role: 'user', 
            content: `RESEARCH QUESTION: "${researchState.intent}"

FINDINGS FROM ALL ITERATIONS:
${allFindings}

Create a comprehensive research report with these sections:
1. TITLE - Clear, informative title for the report
2. EXECUTIVE SUMMARY - Brief overview of key conclusions (1-2 paragraphs)
3. KEY FINDINGS - Major findings (numbered list)
4. DETAILED ANALYSIS - Comprehensive analysis of findings (2-3 paragraphs)
5. CONCLUSION - Final answer to the research question
6. LIMITATIONS - Key limitations of this research
7. FURTHER RESEARCH - Suggestions for additional research

Make the report clear, factual, and directly answer the original research question.` 
          }
        ],
        max_tokens: 1500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const fullReport = data.choices[0].message.content;
    
    return {
      type: 'synthesis',
      fullText: fullReport
    };
  } catch (error) {
    console.error(`Final report generation failed: ${error}`);
    return {
      type: 'synthesis',
      title: "Research Synthesis Error",
      executiveSummary: `Error generating final report: ${error}`,
      error: true
    };
  }
}

/**
 * Conduct deep, iterative research
 */
async function conductDeepResearch(
  intent: string, 
  iterations = 3, 
  model = DEFAULT_MODEL,
  apiKey: string
) {
  console.log(`Deep Research on: "${intent}", Iterations: ${iterations}`);
  
  // Initialize research state
  const researchState = {
    intent,
    model,
    startTime: Date.now(),
    totalIterations: iterations,
    iteration: 1,
    findings: [],
    previousQueries: [],
    currentQuery: ""
  };
  
  // Formulate initial strategic query
  let currentQuery = await formInitialQuery(intent, apiKey, model);
  researchState.currentQuery = currentQuery;
  
  // Main research loop
  while (researchState.iteration <= iterations) {
    // Perform research
    const result = await performResearch(currentQuery, researchState, apiKey);
    
    // Store results
    researchState.findings.push(result);
    researchState.previousQueries.push(currentQuery);
    
    // Check if research should continue
    if (researchState.iteration >= iterations || result.error) {
      break;
    }
    
    // Generate next query based on findings
    currentQuery = await generateNextQuery(
      intent, 
      researchState.previousQueries, 
      result.keyFindings, 
      apiKey,
      model
    );
    
    researchState.currentQuery = currentQuery;
    
    // Increment iteration counter
    researchState.iteration++;
  }
  
  // Generate final report
  const finalReport = await generateFinalReport(researchState, apiKey);
  researchState.finalReport = finalReport;
  
  console.log('Research completed');
  
  return {
    intent,
    iterations: researchState.iteration,
    findings: researchState.findings,
    finalReport,
    state: researchState
  };
}

// Serve HTTP requests
Deno.serve(async (req) => {
  // Apply CORS headers
  if (req.method === 'OPTIONS') {
    return cors(req);
  }

  try {
    // Parse the request body
    const { marketId, question, iterations = 3, model = DEFAULT_MODEL } = await req.json();

    if (!marketId || !question) {
      return new Response(
        JSON.stringify({ error: 'Market ID and question are required' }),
        { status: 400, headers: cors().headers }
      );
    }

    // Get OpenRouter API key from Supabase secrets
    const { data: secretData, error: secretError } = await supabaseClient
      .from('secrets')
      .select('value')
      .eq('name', 'OPENROUTER_API_KEY')
      .single();

    if (secretError || !secretData) {
      return new Response(
        JSON.stringify({ error: 'Could not retrieve OpenRouter API key' }),
        { status: 500, headers: cors().headers }
      );
    }

    const apiKey = secretData.value;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not found' }),
        { status: 500, headers: cors().headers }
      );
    }

    // Conduct deep research
    const researchResults = await conductDeepResearch(
      question,
      iterations,
      model,
      apiKey
    );

    // Return the research results
    return new Response(
      JSON.stringify(researchResults),
      { headers: cors().headers }
    );
  } catch (error) {
    console.error('Error in deep research:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unknown error occurred' }),
      { status: 500, headers: cors().headers }
    );
  }
});
