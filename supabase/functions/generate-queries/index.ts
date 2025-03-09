
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

    // Determine the primary research target - focus text takes precedence over general query
    const primaryResearchTarget = focusText?.trim() || query;
    const isFocusedQuery = Boolean(focusText?.trim());

    console.log('Request params:', { 
      primaryResearchTarget,
      queryType: isFocusedQuery ? 'focused' : 'general',
      marketQuestion: marketQuestion || 'not provided',
      marketPrice: marketPrice !== undefined ? marketPrice + '%' : 'not provided',
      iteration, 
      previousQueriesCount: previousQueries.length,
      previousAnalysesCount: previousAnalyses.length
    });
    
    // Base system prompt that explicitly prioritizes the research target
    let systemPrompt = `You are an expert search query generator for market prediction research.

REQUIREMENTS:
1. Generate EXACTLY 5 diverse search queries for researching "${primaryResearchTarget}"
2. Each query MUST be specific, detailed and actionable
3. Format as search terms rather than questions
4. Respond ONLY with a JSON object containing a 'queries' array of 5 string elements`;

    // Add focus-specific formatting instructions if this is a focused query
    if (isFocusedQuery) {
      systemPrompt += `\n\nCRITICAL FORMATTING INSTRUCTION:
5. EVERY query MUST start with "${focusText}: " (this exact prefix is MANDATORY)
6. Each query should be 10-20 words long (not counting the prefix)`;
    }

    console.log('System prompt:', systemPrompt);

    // Construct user prompt with context about the market and previous research
    let userPrompt = `Generate 5 detailed search queries to thoroughly research "${primaryResearchTarget}"`;
    
    // Add market question context if available
    if (marketQuestion) {
      userPrompt += ` in the context of the prediction market question: "${marketQuestion}"`;
    }
    
    // Add market price context if available
    if (marketPrice !== undefined) {
      userPrompt += `\nCurrent market probability: ${marketPrice}%`;
    }
    
    // Add iteration information
    if (iteration > 1) {
      userPrompt += `\nThis is research iteration #${iteration}.`;
    }

    // Add previous queries to avoid duplication
    if (previousQueries.length > 0) {
      const recentQueries = previousQueries.slice(-10);
      userPrompt += `\n\nDO NOT repeat these previous queries:\n${recentQueries.map(q => `- ${q}`).join('\n')}`;
    }

    // Add focused query formatting examples if applicable
    if (isFocusedQuery) {
      userPrompt += `\n\nFORMATTING REQUIREMENTS:
1. EVERY query MUST start with "${focusText}: " (this exact prefix is MANDATORY)
2. Each query should be specific and contain 10-20 words (not counting the prefix)

EXAMPLES of well-formatted queries:
- "${focusText}: historical precedents and statistical analysis from 2020-2024"
- "${focusText}: expert opinions and recent developments"
- "${focusText}: impact on market predictions and betting odds"`;
    }

    // Add response format instructions
    userPrompt += `\n\nRespond with a JSON object containing a 'queries' array with EXACTLY 5 search query strings.`;
    
    console.log('User prompt:', userPrompt.substring(0, 200) + '...');
    
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
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
    
    if (!result?.choices?.[0]?.message?.content) {
      console.error('Invalid response format from OpenRouter:', result);
      throw new Error('Invalid response format from OpenRouter');
    }
    
    const content = result.choices[0].message.content.trim();
    
    // For debugging
    console.log('Raw LLM response:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
    
    // Try to parse the response as JSON
    try {
      const queriesData = JSON.parse(content);
      
      if (!queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
        throw new Error('No valid queries in response');
      }
      
      // Process queries - ensure proper formatting for focus queries
      let finalQueries = queriesData.queries;
      
      if (isFocusedQuery) {
        console.log('Processing focused queries to ensure correct formatting');
        finalQueries = finalQueries.map(query => {
          // Only add the focus prefix if it's not already there
          if (!query.toLowerCase().startsWith(focusText.toLowerCase())) {
            return `${focusText}: ${query}`;
          }
          return query;
        });
      }
      
      // Ensure we have exactly 5 queries
      while (finalQueries.length < 5) {
        const backupQuery = isFocusedQuery
          ? `${focusText}: additional relevant information and analysis ${finalQueries.length + 1}`
          : `${primaryResearchTarget} additional relevant information ${finalQueries.length + 1}`;
        
        console.log(`Adding backup query to reach 5: ${backupQuery}`);
        finalQueries.push(backupQuery);
      }
      
      // Limit to 5 queries
      finalQueries = finalQueries.slice(0, 5);
      
      console.log('Final queries:', finalQueries);
      
      return new Response(
        JSON.stringify({ queries: finalQueries }),
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
      
      // Create simple fallback queries
      const fallbackQueries = generateFallbackQueries(primaryResearchTarget);
      console.log('Using fallback queries due to parse error:', fallbackQueries);
      
      return new Response(
        JSON.stringify({ 
          queries: fallbackQueries,
          error: 'Error parsing LLM response, using fallback queries' 
        }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      );
    }
  } catch (error) {
    console.error('Error generating queries:', error);
    
    const query = error.focusText || error.query || "unknown topic";
    const fallbackQueries = generateFallbackQueries(query);
    
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

// Simplified fallback query generator that properly handles focus text
function generateFallbackQueries(topic: string): string[] {
  // Check if topic appears to be a focus text (contains a colon)
  const hasFocusFormat = topic.includes(':');
  const cleanTopic = hasFocusFormat ? topic.split(':')[0].trim() : topic;
  
  return [
    `${cleanTopic}: recent verified information from reliable sources`,
    `${cleanTopic}: detailed analysis with supporting evidence`,
    `${cleanTopic}: comprehensive evaluation from multiple perspectives`,
    `${cleanTopic}: specific examples and case studies`,
    `${cleanTopic}: expert opinions and statistical data`
  ];
}
