
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
    const requestData = await req.json();
    const { query, marketId, marketDescription, question } = requestData;
    
    // Use either question or query parameter
    const researchQuery = question || query || "";
    const description = marketDescription || "";
    
    console.log("Received request for query generation:", { researchQuery, marketId, description });
    
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }
    
    const contextInfo = `
      Market Question: ${researchQuery}
      ${description ? `Market Description: ${description}` : ''}
      ${marketId ? `Market ID: ${marketId}` : ''}
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
    
    console.log("Sending request to OpenRouter with google/gemini-2.0-flash-lite-001 model");
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': 'https://hunchex.app',
        'X-Title': 'HunchEx',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-001',
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
          
          // Check if queries contain undefined values and replace them if needed
          if (queries.some(q => q === "undefined" || q === undefined)) {
            console.log("Found undefined values in queries, using fallback queries");
            queries = [
              `${researchQuery} latest news`,
              `${researchQuery} analysis`,
              `${researchQuery} probability`,
            ];
          }
        } catch (parseError) {
          console.error("Error parsing JSON from model response:", parseError);
          // If JSON parsing fails, try to extract queries with regex
          const match = content.match(/"queries"\s*:\s*\[(.*?)\]/s);
          if (match && match[1]) {
            queries = match[1].split(',')
              .map(q => q.trim().replace(/^"/, '').replace(/"$/, ''))
              .filter(q => q.length > 0 && q !== "undefined");
          }
        }
      }
    } catch (parseError) {
      console.error("Error extracting queries from model response:", parseError);
    }
    
    // If extraction failed or no queries were found, fall back to simple queries
    if (!queries.length || queries.every(q => q === "undefined" || q === undefined)) {
      console.log("Falling back to simple query generation");
      queries = [
        `${researchQuery} latest news`,
        `${researchQuery} analysis`,
        `${researchQuery} probability`,
      ];
    }
    
    console.log("Final generated queries:", queries);
    
    // Return the result
    return new Response(JSON.stringify({ queries }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error("Error in generate-queries function:", error);
    
    // Get the query from the request if possible
    let query = "unknown";
    try {
      const requestData = await req.json();
      query = requestData.query || requestData.question || "unknown";
    } catch {
      // Ignore parsing errors
    }
    
    // Fallback queries based on the query
    const fallbackQueries = [
      `${query} latest news`,
      `${query} analysis`,
      `${query} forecast`,
    ];
    
    return new Response(JSON.stringify({ queries: fallbackQueries }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
