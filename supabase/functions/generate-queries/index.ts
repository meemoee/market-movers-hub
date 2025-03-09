
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

    console.log('Request params:', { 
      query, 
      marketQuestion: marketQuestion || 'not provided',
      marketPrice: marketPrice !== undefined ? marketPrice + '%' : 'not provided',
      focusText: focusText || 'not provided',
      iteration, 
      previousQueriesCount: previousQueries.length,
      previousAnalysesCount: previousAnalyses.length
    })

    // Determine if this is a focused query or a general query
    const isFocusedQuery = !!focusText;
    
    // Construct system prompt
    const systemPrompt = isFocusedQuery 
      ? `You are a specialized search query generator focusing on "${focusText}".

CRITICAL REQUIREMENTS:
1. Generate EXACTLY 5 detailed search queries about "${focusText}"
2. EVERY query MUST start with "${focusText}: " (this prefix is MANDATORY)
3. Each query should be specific, detailed, and diverse to gather comprehensive information
4. Each query should be a search phrase (not a question) with 10-20 words
5. Respond ONLY with a JSON object containing a 'queries' array of 5 string elements`
      : `You are a search query generator for market research.

REQUIREMENTS:
1. Generate EXACTLY 5 diverse search queries for researching "${query}"
2. Each query should be specific and focused to gather comprehensive information
3. Format as search terms rather than questions
4. Respond ONLY with a JSON object containing a 'queries' array of 5 string elements`;

    // Construct user prompt
    let userPrompt = isFocusedQuery
      ? `Generate 5 diverse, specific search queries to thoroughly research "${focusText}".

Each query MUST:
1. Start with "${focusText}: "
2. Contain 10-20 words
3. Be specific and actionable
4. Explore different aspects of the topic

These queries will be used to research information about ${marketQuestion || query}.
${marketPrice !== undefined ? `Current market probability: ${marketPrice}%` : ''}
${iteration > 1 ? `Research iteration: ${iteration}` : ''}

${previousQueries.length > 0 
  ? `DO NOT repeat these previous queries:\n${previousQueries.slice(-10).map(q => `- ${q}`).join('\n')}`
  : ''}`
      : `Generate 5 diverse search queries to research "${query}"${marketQuestion ? ` related to ${marketQuestion}` : ''}.
${marketPrice !== undefined ? `Current market probability: ${marketPrice}%` : ''}
${iteration > 1 ? `Research iteration: ${iteration}` : ''}

${previousQueries.length > 0 
  ? `DO NOT repeat these previous queries:\n${previousQueries.slice(-10).map(q => `- ${q}`).join('\n')}`
  : ''}`;

    // Example of well-formed queries for focus queries
    if (isFocusedQuery) {
      userPrompt += `

EXAMPLES of well-formed queries:
- "${focusText}: historical data and statistics from 2020-2024"
- "${focusText}: expert analysis and recent developments"
- "${focusText}: impact on ${query.split(' ').slice(0, 3).join(' ')}"`;
    }

    // Add response format instructions
    userPrompt += `

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;

    console.log('Using system prompt:', systemPrompt.substring(0, 200) + '...')
    console.log('Using user prompt:', userPrompt.substring(0, 200) + '...')
    
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
    console.log('Content from LLM:', content);
    
    // Try to parse the response as JSON
    try {
      const queriesData = JSON.parse(content);
      
      if (!queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
        throw new Error('No valid queries in response');
      }
      
      // Ensure proper formatting for focus queries
      let finalQueries = queriesData.queries;
      
      if (isFocusedQuery) {
        finalQueries = finalQueries.map(query => {
          if (!query.toLowerCase().startsWith(focusText.toLowerCase())) {
            return `${focusText}: ${query}`;
          }
          return query;
        });
      }
      
      // Ensure we have exactly 5 queries
      while (finalQueries.length < 5) {
        finalQueries.push(isFocusedQuery
          ? `${focusText}: additional information and recent developments ${finalQueries.length}`
          : `${query} ${finalQueries.length > 0 ? 'additional' : ''} relevant information ${finalQueries.length}`
        );
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
      
      // Simple fallback for parsing failure
      const extractedQueries = extractQueriesFromText(content, focusText || query);
      console.log('Extracted queries from malformed response:', extractedQueries);
      
      return new Response(
        JSON.stringify({ 
          queries: extractedQueries,
          error: 'Error parsing LLM response, using extracted queries' 
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
    
    // Create simple fallback queries
    const fallbackQueries = generateFallbackQueries(focusText || query);
    
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

// Simple extraction of queries from text
function extractQueriesFromText(text: string, focusText: string): string[] {
  const queries = [];
  
  // Extract lines that might be queries
  const lines = text.split('\n');
  for (const line of lines) {
    // Remove markdown formatting, bullets, numbers, etc.
    let cleaned = line.replace(/^[-*•#0-9]+\.?\s*/, '').trim();
    // Remove quotes
    cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
    
    if (cleaned.length > 5) {
      queries.push(cleaned);
    }
  }
  
  // If we couldn't extract queries, try looking for quoted text
  if (queries.length === 0) {
    const quoteMatches = text.match(/"([^"]+)"/g);
    if (quoteMatches) {
      for (const match of quoteMatches) {
        const cleaned = match.replace(/^"|"$/g, '').trim();
        if (cleaned.length > 5) {
          queries.push(cleaned);
        }
      }
    }
  }
  
  // Format the queries with the focus text if needed
  const formattedQueries = queries.map(q => {
    if (focusText && !q.toLowerCase().startsWith(focusText.toLowerCase())) {
      return `${focusText}: ${q}`;
    }
    return q;
  });
  
  // Ensure we have at least 5 queries
  while (formattedQueries.length < 5) {
    formattedQueries.push(focusText 
      ? `${focusText}: additional information ${formattedQueries.length}` 
      : `relevant information ${formattedQueries.length}`);
  }
  
  return formattedQueries.slice(0, 5);
}

// Fallback query generator for when everything else fails
function generateFallbackQueries(topic: string): string[] {
  const isFocusQuery = topic.includes(':');
  const focusText = isFocusQuery ? topic.split(':')[0].trim() : topic;
  
  const templates = [
    `${focusText}: recent verified information from reliable sources`,
    `${focusText}: detailed analysis with supporting evidence`,
    `${focusText}: comprehensive evaluation from multiple perspectives`,
    `${focusText}: specific examples and case studies`,
    `${focusText}: expert opinions and statistical data`
  ];
  
  return templates;
}
