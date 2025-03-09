
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

    console.log('Generating queries for:', query)
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

DO NOT REPEAT OR CLOSELY RESEMBLE any of the previous queries listed above. Generate entirely new search queries focused specifically on "${focusText || query}".`;
    }

    // Generate appropriate system prompt based on whether this is a focus area query
    const systemPrompt = generateSystemPrompt(focusText, query);
    
    // Log system prompt for debugging
    console.log('Using system prompt:', systemPrompt.substring(0, 200) + '...')
    
    // Generate user prompt
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
      
      // Log the complete raw response for debugging
      console.log('Complete raw LLM response:', JSON.stringify(result));
      
      if (!result?.choices?.[0]?.message?.content) {
        console.error('Invalid response format from OpenRouter:', result);
        throw new Error('Invalid response format from OpenRouter');
      }
      
      const content = result.choices[0].message.content.trim();
      console.log('Content from LLM:', content);
      
      // Try to parse the response as JSON
      try {
        const queriesData = JSON.parse(content);
        
        if (!queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.error('No valid queries in response:', queriesData);
          
          // Try to extract queries from malformed response
          const extractedQueries = extractQueriesFromText(content, focusText || query);
          if (extractedQueries.length > 0) {
            console.log('Successfully extracted queries from text:', extractedQueries);
            const enhancedQueries = enhanceQueriesWithFocus(extractedQueries, focusText, query);
            console.log('Final queries after extraction:', enhancedQueries);
            return formatSuccessResponse(enhancedQueries);
          }
          
          // If extraction fails, use fallback generator
          console.log('Using fallback query generator as last resort');
          const fallbackQueries = generateFocusedFallbackQueries(
            focusText || query, 
            5, 
            Math.max(1, iteration || 1)
          );
          console.log('Fallback queries:', fallbackQueries);
          return formatSuccessResponse(fallbackQueries);
        }
        
        // Clean and enhance the queries with focus text
        const enhancedQueries = cleanAndEnhanceQueries(queriesData.queries, focusText, query);
        console.log('Final enhanced queries:', enhancedQueries);
        
        return formatSuccessResponse(enhancedQueries);
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        console.error('Raw content causing error:', content);
        
        // Try to extract queries directly from the text content
        const extractedQueries = extractQueriesFromText(content, focusText || query);
        if (extractedQueries.length > 0) {
          console.log('Successfully extracted queries despite parse error:', extractedQueries);
          const enhancedQueries = enhanceQueriesWithFocus(extractedQueries, focusText, query);
          console.log('Final queries after extraction from error case:', enhancedQueries);
          return formatSuccessResponse(enhancedQueries);
        }
        
        // Use fallback generator as last resort
        console.log('Using fallback query generator after parse error');
        const fallbackQueries = generateFocusedFallbackQueries(
          focusText || query, 
          5, 
          Math.max(1, iteration || 1)
        );
        console.log('Fallback queries after parse error:', fallbackQueries);
        return formatSuccessResponse(fallbackQueries);
      }
    } catch (apiError) {
      console.error('Error in OpenRouter API call:', apiError);
      
      // Use fallback generator
      console.log('Using fallback query generator due to API error');
      const fallbackQueries = generateFocusedFallbackQueries(
        focusText || query, 
        5, 
        Math.max(1, iteration || 1)
      );
      console.log('Fallback queries after API error:', fallbackQueries);
      return formatSuccessResponse(fallbackQueries);
    }
  } catch (error) {
    console.error('Error generating queries:', error);
    
    // Create highly specialized fallback queries 
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
        status: 200,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

// Helper function to clean and enhance queries
function cleanAndEnhanceQueries(
  queries: string[], 
  focusText: string | undefined, 
  query: string
): string[] {
  if (!queries || queries.length === 0) {
    return generateFocusedFallbackQueries(focusText || query, 5, 1);
  }
  
  // Clean the queries
  let cleanedQueries = queries.map(q => {
    // Remove markdown formatting, bullets, numbers, etc.
    let cleaned = q.replace(/^[-*•#0-9]+\.\s*/, '').trim();
    // Remove quotes
    cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
    return cleaned;
  });
  
  // Filter out empty or duplicate queries
  cleanedQueries = cleanedQueries.filter((q, i, arr) => 
    q.length > 0 && arr.indexOf(q) === i
  );
  
  // Enhance with focus text if needed
  return enhanceQueriesWithFocus(cleanedQueries, focusText, query);
}

// Helper function to generate focused fallback queries
function generateFocusedFallbackQueries(focusText: string, count: number, iteration: number): string[] {
  // Add unique identifier to prevent duplicates
  const uniqueId = Date.now().toString().slice(-4);
  
  // For focus text, create specific and diverse queries
  if (focusText) {
    // Template patterns specifically designed for the focus text
    const templates = [
      `${focusText}: recent verified information from reliable sources`,
      `${focusText}: detailed analysis with supporting evidence`,
      `${focusText}: comprehensive evaluation from multiple perspectives`,
      `${focusText}: specific examples and case studies`,
      `${focusText}: expert opinions and assessments`,
      `${focusText}: statistical data and measurements`,
      `${focusText}: historical development and changes`,
      `${focusText}: timeline of key events`,
      `${focusText}: contrasting viewpoints and debates`,
      `${focusText}: latest developments and news`
    ];
    
    // Return unique templates based on the count needed
    return templates.slice(0, count);
  }
  
  // For general queries without focus
  return [
    `${query} latest information`,
    `${query} detailed analysis`,
    `${query} expert perspectives`,
    `${query} recent developments`,
    `${query} factual statistics`
  ].slice(0, count);
}

// Helper function to generate system prompt
function generateSystemPrompt(focusText: string | undefined, query: string): string {
  if (focusText) {
    return `You are a specialized research assistant focused on generating search queries about "${focusText}".

CRITICAL REQUIREMENTS:
1. EVERY query MUST start with "${focusText}: " followed by specific search terms
2. Each query must be about "${focusText}" directly
3. Generate diverse search queries that explore different aspects of "${focusText}"
4. Each query should be concise (10-20 words) but specific
5. DO NOT generate questions - only search terms
6. DO NOT include explanations or commentary
7. Return EXACTLY 5 search queries in a JSON array

FOCUS EXCLUSIVELY on "${focusText}" and nothing else.`;
  } else {
    return `You are a research assistant generating search queries to gather information on "${query}".
Your goal is to create 5 diverse, specific search queries that will yield informative results.
Return the queries as a JSON object with a "queries" array property.`;
  }
}

// Helper function to generate user prompt
function generateUserPrompt(
  focusText: string | undefined, 
  query: string, 
  marketQuestion: string | undefined,
  marketPrice: number | undefined,
  iteration: number,
  previousResearchContext: string
): string {
  let prompt = `Generate 5 diverse search queries to research:
${focusText ? `"${focusText}"` : `"${query}"`}

${marketQuestion ? `Related to market question: ${marketQuestion}` : ''}
${marketPrice !== undefined ? `Current market probability: ${marketPrice}%` : ''}
${iteration > 1 ? `Research iteration: ${iteration}` : ''}
${previousResearchContext}`;

  // Add stronger guidance for focused queries
  if (focusText) {
    prompt += `
\nIMPORTANT REQUIREMENTS:
1. EVERY query MUST begin with "${focusText}: " exactly as written
2. Each query should be 10-20 words long
3. Each query must explore a distinct aspect or angle
4. Do not include questions, just search terms
5. DO NOT repeat previous queries

EXAMPLES OF WELL-FORMED QUERIES:
- "${focusText}: statistical analysis from government data 2023-2024"
- "${focusText}: verified statements from authoritative sources"
- "${focusText}: documented case studies with supporting evidence"

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;
  } else {
    prompt += `\n\nRespond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;
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
    // Clean the query text
    let cleanQuery = queryText.trim();
    
    // Check if it already starts with the focus text
    if (!cleanQuery.toLowerCase().startsWith(focusText.toLowerCase())) {
      // If not, prepend the focus text
      return `${focusText}: ${cleanQuery}`;
    }
    
    return cleanQuery;
  });
  
  // Filter out empty or too short queries
  enhancedQueries = enhancedQueries.filter(q => q.length > focusText.length + 3);
  
  // Ensure we have enough queries (at least 5)
  while (enhancedQueries.length < 5) {
    const fallbackQuery = generateFocusedFallbackQueries(focusText, 1, Date.now())[0];
    if (!enhancedQueries.includes(fallbackQuery)) {
      enhancedQueries.push(fallbackQuery);
    }
  }
  
  // Return exactly 5 queries
  return enhancedQueries.slice(0, 5);
}

// Helper function to extract queries from text
function extractQueriesFromText(text: string, focusText: string): string[] {
  const queries: string[] = [];
  
  // Try to extract queries using multiple patterns
  
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
  
  // Clean extracted queries
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
