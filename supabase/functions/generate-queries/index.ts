
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

    // Enhanced system prompt for focused research to ensure LLM prioritizes focus text
    let systemPrompt = 'You are a helpful assistant that generates search queries.';
    
    if (focusText) {
      systemPrompt = `You are a specialized research assistant focusing EXCLUSIVELY on: "${focusText}".
Your task is to generate highly specific search queries about ${focusText} that provide targeted information relevant to ${marketQuestion || query}.
CRITICAL REQUIREMENT: EVERY query MUST explicitly mention "${focusText}" and include additional specific qualifiers or dimensions.
DO NOT generate generic queries or queries that fail to directly address "${focusText}".`;
    }
    
    // Log additional debug information
    console.log('Using system prompt:', systemPrompt.substring(0, 100) + '...')
    
    // Construct a more specific user prompt that emphasizes the focus area
    let userPrompt = `Generate 5 diverse search queries to gather comprehensive information about: ${focusText || query}

${marketQuestion ? `Market Question: ${marketQuestion}` : `Topic: ${query}`}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${iteration > 1 ? `Current research iteration: ${iteration}` : ''}
${previousResearchContext}`;

    // Add stronger guidance for focused queries
    if (focusText) {
      userPrompt += `\n\nCRITICAL REQUIREMENTS FOR YOUR QUERIES:
1. EVERY query MUST begin with "${focusText}: " to ensure proper focus
2. Each query must be detailed and specific about "${focusText}"
3. Include different aspects and angles for each query
4. Each query should be 10-20 words long and provide clear search intent
5. DO NOT repeat or closely resemble previous research queries

EXAMPLE FORMAT for "${focusText}" queries:
- "${focusText}: detailed statistical analysis from reputable sources 2023-2024"
- "${focusText}: official statements from White House press releases verified"
- "${focusText}: contradictory evidence from major news organizations"

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;
    } else {
      userPrompt += `\n\nGenerate 5 search queries that are diverse, specific, and include different aspects of the topic.

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;
    }
    
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
      
      try {
        // Parse the JSON response directly
        const queriesData = JSON.parse(content);
        
        if (!queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.error('No valid queries in response:', queriesData);
          throw new Error('No valid queries in response');
        }
        
        // Process and enhance the queries for better focus
        let enhancedQueries = [...queriesData.queries];
        
        // Ensure we have exactly 5 queries
        if (enhancedQueries.length < 5) {
          console.log('Less than 5 queries received, filling with generated ones');
          
          // Generate additional queries if we don't have enough
          const generatedQueries = generateFocusedQueries(focusText || query, 5 - enhancedQueries.length, iteration);
          enhancedQueries = [...enhancedQueries, ...generatedQueries];
        } else if (enhancedQueries.length > 5) {
          console.log('More than 5 queries received, trimming to 5');
          enhancedQueries = enhancedQueries.slice(0, 5);
        }
        
        // Ensure focus text is properly included in each query
        if (focusText) {
          enhancedQueries = enhancedQueries.map((query, index) => {
            // Check if query already includes the focus text
            if (!query.toLowerCase().includes(focusText.toLowerCase())) {
              return `${focusText}: ${query}`;
            }
            
            // If query doesn't start with the focus text, prepend it
            if (!query.toLowerCase().startsWith(focusText.toLowerCase())) {
              // Remove any occurrence of focus text in the middle of the query to avoid duplication
              const cleanQuery = query.replace(new RegExp(focusText, 'i'), '').trim();
              return `${focusText}: ${cleanQuery}`;
            }
            
            return query;
          });
        }
        
        console.log('Final enhanced queries:', enhancedQueries);
        
        return new Response(
          JSON.stringify({ queries: enhancedQueries }),
          { 
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json'
            } 
          }
        );
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        console.error('Raw content causing error:', content);
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
  // For focus text, create specific and diverse queries
  if (focusText) {
    // Template patterns for focused research
    const templates = [
      `${focusText}: recent official statements and press releases from authoritative sources`,
      `${focusText}: detailed factual information with verification from multiple sources`,
      `${focusText}: comprehensive analysis with supporting evidence iteration ${iteration}`,
      `${focusText}: specific examples documented in reliable news sources iteration ${iteration}`,
      `${focusText}: expert opinions and analysis from credible organizations iteration ${iteration}`,
      `${focusText}: statistical data and evidence with proper attribution iteration ${iteration}`,
      `${focusText}: historical precedents and comparative analysis iteration ${iteration}`,
      `${focusText}: documented timeline of events with verification iteration ${iteration}`,
      `${focusText}: contradictory viewpoints with supporting evidence iteration ${iteration}`,
      `${focusText}: latest developments reported by major news outlets iteration ${iteration}`
    ];
    
    // Return unique templates based on the count needed
    return templates.slice(0, count).map((template, i) => 
      template + (i > 0 ? ` variant ${i}` : '')
    );
  }
  
  // For general queries without focus
  return [
    `${query} latest information iteration ${iteration}`,
    `${query} analysis and trends iteration ${iteration}`,
    `${query} expert opinions iteration ${iteration}`,
    `${query} recent developments iteration ${iteration}`,
    `${query} statistics and data iteration ${iteration}`
  ].slice(0, count);
}

// Helper function to generate additional focused queries if needed
function generateFocusedQueries(focusText: string, count: number, iteration: number): string[] {
  const uniqueId = Date.now().toString().slice(-4);
  
  const templates = [
    `${focusText}: detailed analysis from multiple credible sources ${uniqueId}-${iteration}`,
    `${focusText}: verified information with supporting evidence ${uniqueId}-${iteration}`,
    `${focusText}: comparative assessment with historical context ${uniqueId}-${iteration}`,
    `${focusText}: expert evaluation with data-driven insights ${uniqueId}-${iteration}`,
    `${focusText}: quantitative measurements from reliable sources ${uniqueId}-${iteration}`,
    `${focusText}: timeline of developments with verification ${uniqueId}-${iteration}`,
    `${focusText}: opposing viewpoints with factual support ${uniqueId}-${iteration}`,
    `${focusText}: statistical analysis with proper attribution ${uniqueId}-${iteration}`,
    `${focusText}: case studies demonstrating real-world impact ${uniqueId}-${iteration}`,
    `${focusText}: academic research findings with citations ${uniqueId}-${iteration}`
  ];
  
  return templates.slice(0, count);
}
