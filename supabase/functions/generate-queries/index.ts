
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Received request to generate queries');
    const requestBody = await req.json();
    const { description, marketId, marketQuestion } = requestBody;

    // Clean up the description to remove resolution text, etc.
    let cleanDescription = description || '';
    
    // Remove common resolution boilerplate text
    cleanDescription = cleanDescription
      .replace(/This market will resolve to .+?\./g, '')
      .replace(/The market resolves to .+?\./g, '')
      .replace(/This market resolves to .+?\./g, '')
      .replace(/Resolution source.+?$/g, '')
      .replace(/Resolution criteria.+?$/g, '')
      .replace(/Resolution notes.+?$/g, '');

    // Clean up and normalize string
    cleanDescription = cleanDescription.trim();

    console.log('Calling OpenRouter to generate queries for description:', cleanDescription);
    console.log('Market question:', marketQuestion);

    let queries;
    try {
      // Call OpenRouter API with Gemini Flash model and JSON output mode
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': 'https://hunchex.app',
          'X-Title': 'HunchEx',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku:beta',
          messages: [
            {
              role: 'system',
              content: `You are a query generation assistant that creates search queries for market research.
              
              Given information about a prediction market question, generate 3 specific search queries that would help find the most relevant and up-to-date information about this topic.
              
              Output must be valid JSON in this format:
              {
                "queries": [
                  "query 1",
                  "query 2", 
                  "query 3"
                ]
              }
              
              Guidelines:
              - Focus on getting current information and analysis
              - Include specific keywords from the market question
              - Create variations that might find different sources
              - Format queries as someone would type them into a search engine
              - DO NOT include the market ID in your queries
              - DO NOT ask questions in the queries, just use keywords for search
              - DO NOT include "prediction market" terms in the queries
              - Return ONLY the JSON, nothing else`
            },
            {
              role: 'user',
              content: `Generate search queries for researching this prediction market:\n\nQuestion: ${marketQuestion || ''}\n\nDescription: ${cleanDescription}`
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!openRouterResponse.ok) {
        throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${openRouterResponse.statusText}`);
      }

      const openRouterData = await openRouterResponse.json();
      console.log('OpenRouter response:', JSON.stringify(openRouterData));

      const aiResponse = openRouterData.choices[0]?.message?.content || '';
      
      // Parse the JSON response from the AI
      try {
        const jsonResponse = JSON.parse(aiResponse);
        queries = jsonResponse.queries;
        
        if (!Array.isArray(queries) || queries.length === 0) {
          throw new Error('Invalid query format returned');
        }
        
        console.log('Successfully parsed queries:', queries);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        throw new Error('Failed to parse AI response as JSON');
      }
    } catch (openRouterError) {
      console.error('OpenRouter API error:', openRouterError);
      
      // Fallback: generate simple queries based on the market question
      const baseQuery = marketQuestion || cleanDescription.split('.')[0];
      queries = [
        `${baseQuery} latest information`,
        `${baseQuery} recent updates`,
        `${baseQuery} analysis prediction`
      ];
      console.log('Using fallback queries:', queries);
    }

    console.log('Final queries:', queries);
    
    return new Response(
      JSON.stringify({ queries }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error in generate-queries function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        queries: [`Error generating queries: ${error.message}`]
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
