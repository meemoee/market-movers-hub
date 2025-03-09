
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

    // Log the inputs to help with debugging
    console.log('Focus text:', focusText || 'not provided')
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Query:', query || 'not provided')
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Iteration:', iteration)
    console.log('Previous queries count:', previousQueries.length)
    
    // Create a simpler context from previous research if available
    let previousResearchContext = '';
    if (previousQueries.length > 0) {
      previousResearchContext = `
PREVIOUS RESEARCH CONTEXT:
${previousQueries.slice(-10).map((q, i) => `${i+1}. ${q}`).join('\n')}

DO NOT REPEAT any of these previous queries. Generate completely new search directions.`;
    }

    // Build a simpler directive prompt
    const focusedPrompt = focusText ? 
      `You are a research assistant focusing on: "${focusText}".
Your task is to generate search queries that provide information relevant to ${marketQuestion || query}.
CRITICAL: EVERY query MUST contain "${focusText}" explicitly.` 
      : 
      "You are a helpful assistant that generates search queries.";
    
    // Set up a timeout for the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://market-research-app.com',
          'X-Title': 'Market Research App',
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5",
          messages: [
            {
              role: "system",
              content: focusedPrompt
            },
            {
              role: "user",
              content: `Generate 5 diverse search queries for research on: ${focusText || query}

${marketQuestion !== query ? `Topic: ${marketQuestion}` : ''}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${previousResearchContext}

${focusText ? `IMPORTANT: Every query MUST include the term "${focusText}"` : ''}

Format your response as a JSON array of 5 query strings. Example format:
["query 1", "query 2", "query 3", "query 4", "query 5"]`
            }
          ],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`OpenRouter API error: ${response.status} - ${await response.text()}`);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('Raw response structure:', Object.keys(result));
      
      if (!result.choices || !result.choices[0]) {
        console.error('Unexpected response structure:', result);
        throw new Error('Unexpected response structure from OpenRouter');
      }
      
      const content = result.choices[0].message.content.trim();
      console.log('Raw LLM response:', content);
      
      try {
        // Parse the response content
        let queriesData;
        
        // Try simple JSON parsing first
        try {
          queriesData = JSON.parse(content);
        } catch (e) {
          console.log('Direct JSON parsing failed, trying to extract JSON from response');
          
          // If direct parsing fails, try to extract JSON from the response
          const jsonMatch = content.match(/\[\s*"[^"]+"\s*(?:,\s*"[^"]+"\s*)*\]/);
          if (jsonMatch) {
            try {
              const queriesArray = JSON.parse(jsonMatch[0]);
              queriesData = { queries: queriesArray };
              console.log('Extracted queries array from response');
            } catch (err) {
              console.error('Failed to parse extracted JSON:', err);
            }
          }
          
          // If still no valid JSON, extract queries using regex
          if (!queriesData) {
            const queryMatches = content.match(/"([^"]*)"/g);
            if (queryMatches && queryMatches.length > 0) {
              const cleanedQueries = queryMatches
                .map(match => match.replace(/"/g, '').trim())
                .filter(q => q.length > 5);
              
              if (cleanedQueries.length > 0) {
                queriesData = { queries: cleanedQueries.slice(0, 5) };
                console.log('Extracted queries using regex');
              }
            }
          }
        }
        
        // If we still don't have valid queries, use fallbacks
        if (!queriesData || !queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.log('Using fallback queries');
          
          // Generate basic fallback queries
          const baseQuery = focusText || query;
          queriesData = {
            queries: [
              `${baseQuery} latest information`,
              `${baseQuery} analysis and trends`,
              `${baseQuery} expert opinions`,
              `${baseQuery} recent developments`,
              `${baseQuery} statistics and data`
            ]
          };
        }
        
        // Ensure we have exactly 5 queries
        if (queriesData.queries.length < 5) {
          const baseQuery = focusText || query;
          const additionalQueries = [
            `${baseQuery} latest developments`,
            `${baseQuery} recent research`,
            `${baseQuery} analysis methods`,
            `${baseQuery} critical factors`,
            `${baseQuery} expert assessment`
          ];
          
          while (queriesData.queries.length < 5) {
            queriesData.queries.push(additionalQueries[queriesData.queries.length % additionalQueries.length]);
          }
        } else if (queriesData.queries.length > 5) {
          queriesData.queries = queriesData.queries.slice(0, 5);
        }
        
        // Ensure focus text is in each query if specified
        if (focusText) {
          const focusLower = focusText.toLowerCase();
          queriesData.queries = queriesData.queries.map((q, i) => {
            if (typeof q !== 'string') {
              return `${focusText} information ${i+1}`;
            }
            
            if (!q.toLowerCase().includes(focusLower)) {
              return `${focusText}: ${q}`;
            }
            
            return q;
          });
        }
        
        console.log('Final generated queries:', queriesData.queries);
        
        return new Response(
          JSON.stringify({ queries: queriesData.queries }),
          { 
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json'
            } 
          }
        );
      } catch (parseError) {
        console.error('Error handling LLM response:', parseError);
        
        // Provide fallback queries
        const fallbackQueries = focusText ? [
          `${focusText} latest information`,
          `${focusText} analysis and trends`,
          `${focusText} expert opinions`,
          `${focusText} recent developments`,
          `${focusText} statistics and data`
        ] : [
          `${query} latest information`,
          `${query} analysis and trends`,
          `${query} expert opinions`,
          `${query} recent developments`,
          `${query} statistics and data`
        ];
        
        return new Response(
          JSON.stringify({ queries: fallbackQueries }),
          { 
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json'
            } 
          }
        );
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('OpenRouter API request timed out after 15 seconds');
        
        // Return fallback queries for timeout
        const fallbackQueries = focusText ? [
          `${focusText} information`,
          `${focusText} analysis`,
          `${focusText} latest`,
          `${focusText} data`,
          `${focusText} news`
        ] : [
          `${query} information`,
          `${query} analysis`,
          `${query} latest`,
          `${query} data`,
          `${query} news`
        ];
        
        return new Response(
          JSON.stringify({ 
            queries: fallbackQueries,
            error: 'Request timed out - using fallback queries'
          }),
          { 
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json'
            } 
          }
        );
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('Error generating queries:', error);
    
    // Create basic fallback queries based on the input
    const baseQuery = focusText || query || "information";
    const fallbackQueries = [
      `${baseQuery} latest information`,
      `${baseQuery} analysis and insights`,
      `${baseQuery} expert perspectives`,
      `${baseQuery} recent developments`,
      `${baseQuery} data and statistics`
    ];
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        queries: fallbackQueries
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
