
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      query, 
      marketPrice, 
      marketQuestion, 
      focusText, 
      previousQueries = [],
      previousAnalyses = [],
      previousProbability,
      iteration = 1
    } = await req.json()

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    console.log('Generating sub-queries for:', query)
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Focus text:', focusText || 'not provided')
    console.log('Iteration:', iteration)
    console.log('Previous queries count:', previousQueries.length)
    console.log('Previous analyses count:', previousAnalyses.length)
    
    // Create context from previous research if available
    let previousResearchContext = '';
    if (previousQueries.length > 0 || previousAnalyses.length > 0) {
      previousResearchContext = `
PREVIOUS RESEARCH CONTEXT:
${previousQueries.length > 0 ? `Previous search queries used:\n${previousQueries.slice(-15).map((q, i) => `${i+1}. ${q}`).join('\n')}` : ''}
${previousAnalyses.length > 0 ? `\nPrevious analysis summary:\n${previousAnalyses.slice(-1)[0].substring(0, 800)}${previousAnalyses.slice(-1)[0].length > 800 ? '...' : ''}` : ''}
${previousProbability ? `\nPrevious probability assessment: ${previousProbability}` : ''}

DO NOT REPEAT OR CLOSELY RESEMBLE any of the previous queries listed above. Generate entirely new search directions SPECIFICALLY focused on "${focusText || query}".`;
    }

    // Enhanced system prompt with stricter guidelines
    const systemPrompt = generateSystemPrompt(focusText, query);
    
    // Log additional debug information
    console.log('Using system prompt:', systemPrompt.substring(0, 100) + '...')
    
    // Construct a more specific user prompt with explicit formatting requirements
    const userPrompt = generateUserPrompt(focusText, query, marketQuestion, marketPrice, iteration, previousResearchContext);
    
    try {
      console.log('Sending request to OpenRouter API...');
      
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Market Research App',
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        console.error(`OpenRouter API error: ${response.status}`);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('OpenRouter API response received');
      
      // Check if we have a valid content
      if (!result?.choices?.[0]?.message?.content) {
        console.error('Invalid response format from OpenRouter:', result);
        throw new Error('Invalid response format from OpenRouter');
      }
      
      const content = result.choices[0].message.content.trim();
      console.log('Raw LLM response:', content);
      
      // Parse the JSON response with more robust error handling
      try {
        // Parse the JSON response directly
        const queriesData = JSON.parse(content);
        
        if (!queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.error('No valid queries in response:', queriesData);
          console.log('Attempting to extract queries from malformed response...');
          
          // Try to extract queries from non-standard response
          const extractedQueries = extractQueriesFromText(content, focusText || query);
          if (extractedQueries.length > 0) {
            console.log('Successfully extracted queries from text:', extractedQueries);
            return formatSuccessResponse(enhanceQueriesWithFocus(extractedQueries, focusText, query));
          }
          
          throw new Error('No valid queries in response and extraction failed');
        }
        
        // Process and enhance the queries for better focus
        let enhancedQueries = enhanceQueriesWithFocus(queriesData.queries, focusText, query);
        
        console.log('Final enhanced queries:', enhancedQueries);
        
        return formatSuccessResponse(enhancedQueries);
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        console.error('Raw content causing error:', content);
        
        // Try to extract queries from malformed response
        const extractedQueries = extractQueriesFromText(content, focusText || query);
        if (extractedQueries.length > 0) {
          console.log('Successfully extracted queries despite parse error:', extractedQueries);
          return formatSuccessResponse(enhanceQueriesWithFocus(extractedQueries, focusText, query));
        }
        
        throw parseError;
      }
    } catch (apiError) {
      console.error('Error in OpenRouter API call:', apiError);
      throw apiError;
    }
  } catch (error) {
    console.error('Error generating queries:', error);
    
    // Only use fallback queries as a last resort
    // Create highly specialized fallback queries based on focus text
    const fallbackQueries = generateFocusedFallbackQueries(
      focusText || query, 
      5, 
      Math.max(1, iteration || 1)
    );
    
    console.log('Using fallback queries due to error:', fallbackQueries);
    
    return new Response(
      JSON.stringify({ 
        queries: fallbackQueries,
        error: error.message 
      }),
      { 
        status: 200, // Still return 200 with fallback queries
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

// Helper function to generate focused fallback queries
function generateFocusedFallbackQueries(focusText: string, count: number, iteration: number): string[] {
  // Add unique identifier to prevent duplicates
  const uniqueId = Date.now().toString().slice(-4);
  
  // For focus text, create specific and diverse queries
  if (focusText) {
    // Template patterns for focused research with explicit query requirements
    const templates = [
      `${focusText}: recent verified information from official sources ${uniqueId}-${iteration}`,
      `${focusText}: detailed factual analysis with supporting evidence ${uniqueId}-${iteration}`,
      `${focusText}: comprehensive evaluation from multiple perspectives ${uniqueId}-${iteration}`,
      `${focusText}: specific documented examples from reliable sources ${uniqueId}-${iteration}`,
      `${focusText}: expert assessments and professional opinions ${uniqueId}-${iteration}`,
      `${focusText}: statistical data and quantitative measurements ${uniqueId}-${iteration}`,
      `${focusText}: historical development and progressive changes ${uniqueId}-${iteration}`,
      `${focusText}: verified timeline of key events and decisions ${uniqueId}-${iteration}`,
      `${focusText}: contrasting viewpoints with evidential support ${uniqueId}-${iteration}`,
      `${focusText}: latest developments reported by credible outlets ${uniqueId}-${iteration}`
    ];
    
    // Return unique templates based on the count needed
    return templates.slice(0, count);
  }
  
  // For general queries without focus
  return [
    `${query} latest authoritative information ${uniqueId}-${iteration}`,
    `${query} detailed analysis from multiple sources ${uniqueId}-${iteration}`,
    `${query} expert perspectives and specialized knowledge ${uniqueId}-${iteration}`,
    `${query} recent developments with contextual background ${uniqueId}-${iteration}`,
    `${query} factual statistics with proper attribution ${uniqueId}-${iteration}`
  ].slice(0, count);
}

// Helper function to generate system prompt with appropriate constraints
function generateSystemPrompt(focusText: string | undefined, query: string): string {
  if (focusText) {
    return `You are a specialized research assistant with EXCLUSIVE FOCUS on: "${focusText}".
Your critical task is to generate highly specific search queries about "${focusText}" that will provide targeted information relevant to the topic.

CRITICAL REQUIREMENTS:
1. EVERY query MUST explicitly start with "${focusText}: " followed by specific qualifiers
2. EVERY query MUST be directly about "${focusText}" - this is non-negotiable
3. Do not generate general or tangential queries that fail to focus specifically on "${focusText}"
4. If you cannot generate queries about "${focusText}", you MUST still format your response as a JSON object with the 'queries' array`;
  } else {
    return 'You are a helpful assistant that generates search queries. Your goal is to provide diverse, specific, and useful queries that will yield informative search results.';
  }
}

// Helper function to generate user prompt with explicit guidance
function generateUserPrompt(
  focusText: string | undefined, 
  query: string, 
  marketQuestion: string | undefined,
  marketPrice: number | undefined,
  iteration: number,
  previousResearchContext: string
): string {
  let prompt = `Generate 5 diverse search queries to gather comprehensive information about: ${focusText || query}

${marketQuestion ? `Market Question: ${marketQuestion}` : `Topic: ${query}`}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${iteration > 1 ? `Current research iteration: ${iteration}` : ''}
${previousResearchContext}`;

  // Add stronger guidance for focused queries
  if (focusText) {
    prompt += `\n\nABSOLUTE REQUIREMENTS FOR YOUR QUERIES:
1. EVERY query MUST begin with "${focusText}: " exactly as written
2. Each query must be 10-20 words long after the "${focusText}: " prefix
3. Each query must explore a distinct aspect or angle of "${focusText}"
4. NEVER repeat or paraphrase previous queries
5. Do not include questions, just search terms

EXAMPLE FORMAT (follow this precisely):
- "${focusText}: statistical analysis from official government data 2023-2024"
- "${focusText}: verified statements from authoritative sources with evidence"
- "${focusText}: documented case studies with supporting evidence"

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;
  } else {
    prompt += `\n\nGenerate 5 search queries that are diverse, specific, and include different aspects of the topic.

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;
  }
  
  return prompt;
}

// Helper function to enhance queries with focus text
function enhanceQueriesWithFocus(
  queries: string[], 
  focusText: string | undefined, 
  query: string
): string[] {
  // No enhancements needed if no focus text
  if (!focusText) return queries.slice(0, 5);
  
  // Process each query to ensure it properly focuses on the topic
  let enhancedQueries = queries.map(queryText => {
    // Clean the query of any markdown or other formatting
    let cleanQuery = queryText.replace(/^[-*•>]+\s*/, '').trim();
    
    // If the query doesn't start with the focus text, ensure it does
    if (!cleanQuery.toLowerCase().startsWith(focusText.toLowerCase())) {
      // Remove any occurrences of the focus text to avoid duplication
      const focusTextRegex = new RegExp(focusText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      cleanQuery = cleanQuery.replace(focusTextRegex, '').trim();
      
      // Handle punctuation between focus text and the rest of the query
      cleanQuery = cleanQuery.replace(/^[:\-;,.\s]+/, '').trim();
      
      // Combine focus text with the cleaned query
      return `${focusText}: ${cleanQuery}`;
    }
    
    return cleanQuery;
  });
  
  // Filter out empty or too short queries
  enhancedQueries = enhancedQueries.filter(q => q.length > focusText.length + 3);
  
  // Ensure we have enough queries
  while (enhancedQueries.length < 5) {
    const fallbackQuery = generateFocusedFallbackQueries(focusText, 1, Date.now())[0];
    if (!enhancedQueries.includes(fallbackQuery)) {
      enhancedQueries.push(fallbackQuery);
    }
  }
  
  // Return at most 5 queries
  return enhancedQueries.slice(0, 5);
}

// Helper function to extract queries from potentially malformed responses
function extractQueriesFromText(text: string, focusText: string): string[] {
  const queries: string[] = [];
  
  // Try multiple extraction patterns
  
  // Pattern 1: Look for numbered lists (1. query text)
  const numberedRegex = /\d+\.\s*(.+?)(?=\n\d+\.|\n\n|$)/gs;
  let match;
  while ((match = numberedRegex.exec(text)) !== null) {
    if (match[1]?.trim()) queries.push(match[1].trim());
  }
  
  // Pattern 2: Look for bullet points
  const bulletRegex = /[-*•][ \t]*([^\n]+)/g;
  while ((match = bulletRegex.exec(text)) !== null) {
    if (match[1]?.trim()) queries.push(match[1].trim());
  }
  
  // Pattern 3: Look for quoted text
  const quoteRegex = /"([^"]+)"/g;
  while ((match = quoteRegex.exec(text)) !== null) {
    if (match[1]?.trim()) queries.push(match[1].trim());
  }
  
  // Pattern 4: Just split by newlines as a last resort
  if (queries.length === 0) {
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => 
        line.length > 10 && 
        !line.startsWith('{') && 
        !line.includes('":') &&
        !line.startsWith('}') && 
        !line.startsWith('[') && 
        !line.startsWith(']')
      );
    
    queries.push(...lines);
  }
  
  return queries
    .map(q => q.replace(/^[-*•>]+\s*/, '').trim())
    .filter((q, i, arr) => q.length > 5 && arr.indexOf(q) === i)
    .slice(0, 5);
}

// Helper function to format the success response
function formatSuccessResponse(queries: string[]): Response {
  return new Response(
    JSON.stringify({ queries }),
    { 
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      } 
    }
  );
}
