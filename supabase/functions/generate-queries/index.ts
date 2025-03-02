
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, description } = await req.json();
    
    console.log("Received request for query generation:", { question, description });
    
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }
    
    const contextInfo = `
      Market Question: ${question}
      ${description ? `Market Description: ${description}` : ''}
    `;
    
    const systemPrompt = `You are a research query generator. Given a prediction market question and description, generate 3 search queries that would help research this topic.
    Focus on factual information that would help determine the likelihood of the event. Queries should be concise and specific.
    Output ONLY valid JSON in the following format:
    {
      "queries": [
        "first search query",
        "second search query", 
        "third search query"
      ]
    }`;
    
    console.log("Sending request to OpenRouter with Gemini Flash model");
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': 'https://hunchex.app',
        'X-Title': 'HunchEx',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextInfo }
        ],
        response_format: { type: "json_object" }
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenRouter API error:", errorData);
      throw new Error(`OpenRouter API returned error: ${response.status} ${errorData}`);
    }
    
    const data = await response.json();
    console.log("Received response from OpenRouter:", data);
    
    let queries = [];
    
    try {
      // Parse the JSON from the content field
      const content = data.choices[0]?.message?.content;
      console.log("Raw content from model:", content);
      
      if (content) {
        // Try to parse as JSON
        try {
          const parsedContent = JSON.parse(content);
          queries = parsedContent.queries || [];
        } catch (parseError) {
          console.error("Error parsing JSON from model response:", parseError);
          // If JSON parsing fails, try to extract queries with regex
          const match = content.match(/"queries"\s*:\s*\[(.*?)\]/s);
          if (match && match[1]) {
            queries = match[1].split(',')
              .map(q => q.trim().replace(/^"/, '').replace(/"$/, ''))
              .filter(q => q.length > 0);
          }
        }
      }
    } catch (parseError) {
      console.error("Error extracting queries from model response:", parseError);
    }
    
    // If extraction failed or no queries were found, fall back to simple queries
    if (!queries.length) {
      console.log("Falling back to simple query generation");
      queries = [
        `${question} latest news`,
        `${question} analysis`,
        `${question} probability`,
      ];
    }
    
    console.log("Final generated queries:", queries);
    
    return new Response(JSON.stringify(queries), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error("Error in generate-queries function:", error);
    
    // Fallback queries based on the question
    const fallbackQueries = [
      `${error.message || "Error generating queries"}`,
      "Please try again later",
    ];
    
    return new Response(JSON.stringify(fallbackQueries), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
