
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RequestBody = {
  query: string;
  previousResults?: string;
  iteration?: number;
  marketId?: string; // Add marketId to the request type
  marketDescription?: string; // Add market description to provide better context
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const { query, previousResults, iteration = 0, marketId, marketDescription } = await req.json() as RequestBody;

    console.log(`Generating queries for market ${marketId || 'unknown market'}`, {
      query,
      iteration,
      previousResultsLength: previousResults?.length || 0,
      marketDescription: marketDescription?.substring(0, 50) + '...'
    });

    const apiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new Error('API key not found');
    }

    let prompt = '';
    const contextInfo = marketId ? `market ID: ${marketId} - ` : '';
    
    if (iteration === 0) {
      // First iteration: generate initial queries
      prompt = `You are a search query generator for a web research system. Your task is to generate web search queries related to the following market question: "${contextInfo}${query}"
      
      ${marketDescription ? `Additional context about this market: ${marketDescription}` : ''}
      
      Create 5 specific, diverse search queries to gather information to help analyze and answer this question. The queries should:
      1. Focus specifically on the exact market question, not tangential topics
      2. Include different angles and aspects relevant to this specific question
      3. Include relevant entities, dates, locations mentioned in the question
      4. Be phrased in ways that will yield high-quality, recent information from search engines
      5. Be focused on finding factual information, not opinions
      
      Format your response as a JSON object with a "queries" array like this: 
      {"queries": ["query 1", "query 2", "query 3", "query 4", "query 5"]}`;
    } else {
      // Subsequent iterations: generate refined queries based on previous results
      prompt = `You are a search query generator for a web research system. Your task is to generate web search queries based on a market question and previous research results.

      Market question: "${contextInfo}${query}"
      
      ${marketDescription ? `Additional context about this market: ${marketDescription}` : ''}
      
      Previous research findings:
      ${previousResults}
      
      Based on the previous research, create 3-4 refined search queries that will help fill gaps in our knowledge or explore promising areas identified in the research. The queries should:
      1. Focus specifically on the exact market question, not tangential topics
      2. Target information gaps identified in the previous research
      3. Avoid repeating searches that would yield similar results to what we already have
      4. Be precisely targeted to the specific market question and context
      5. Be focused on finding factual information
      
      Format your response as a JSON object with a "queries" array like this:
      {"queries": ["query 1", "query 2", "query 3"]}`;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user', 
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Error from OpenAI:', responseData);
      throw new Error(`OpenAI API error: ${responseData.error?.message || JSON.stringify(responseData)}`);
    }

    const content = responseData.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in response');
    }

    try {
      // Try to parse the response as JSON
      const parsed = JSON.parse(content);
      
      if (!parsed.queries || !Array.isArray(parsed.queries)) {
        throw new Error('Response does not contain a valid queries array');
      }

      // Validate each query to ensure it's related to the original question
      const validatedQueries = parsed.queries.filter((query: string) => {
        // A very simple validation - ensure query is not empty and is a string
        return typeof query === 'string' && query.trim().length > 0;
      });

      console.log(`Generated ${validatedQueries.length} queries for market ${marketId || 'unknown'}`, validatedQueries);

      return new Response(
        JSON.stringify({ queries: validatedQueries }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (parseError) {
      console.error('Error parsing OpenAI response as JSON:', parseError);
      console.log('Raw response:', content);
      
      // Attempt to extract queries using regex as a fallback
      const queryMatches = content.match(/"([^"]+)"/g) || [];
      const extractedQueries = queryMatches
        .map((match: string) => match.replace(/"/g, ''))
        .filter((query: string) => query.length > 5 && !query.includes('query'));

      if (extractedQueries.length > 0) {
        console.log('Extracted queries using regex fallback:', extractedQueries);
        return new Response(
          JSON.stringify({ queries: extractedQueries }),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // If all else fails, generate generic queries based on the original query
      const fallbackQueries = [
        `${query} latest information`,
        `${query} analysis`,
        `${query} facts`,
        `${query} details`
      ];
      
      console.log('Using fallback queries:', fallbackQueries);
      
      return new Response(
        JSON.stringify({ queries: fallbackQueries }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
  } catch (error) {
    console.error('Error in generate-queries function:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error in generate-queries function',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
