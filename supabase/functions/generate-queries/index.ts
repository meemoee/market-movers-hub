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
    const { 
      query, 
      marketId, 
      marketDescription, 
      question, 
      previousResults = "", 
      iteration = 1,
      areasForResearch = [],
      focusText = ""
    } = requestData;
    
    // Use either question or query parameter
    const researchQuery = question || query || "";
    const description = marketDescription || "";
    
    console.log("Received request for query generation:", { 
      researchQuery, 
      marketId, 
      description,
      previousResults: previousResults ? "present" : "absent",
      iteration,
      areasForResearch: Array.isArray(areasForResearch) ? areasForResearch.length : 0,
      focusText: focusText ? focusText.substring(0, 100) + "..." : "none"
    });
    
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }
    
    let contextInfo = `
      Market Question: ${researchQuery}
      ${description ? `Market Description: ${description}` : ''}
      ${marketId ? `Market ID: ${marketId}` : ''}
    `;
    
    // Add research focus if provided
    if (focusText) {
      contextInfo += `
        Research Focus: ${focusText}
      `;
    }
    
    // Add previous results and areas for research for iterations after the first
    if (iteration > 1 && previousResults) {
      contextInfo += `
        Previous Analysis: ${previousResults}
      `;
      
      if (Array.isArray(areasForResearch) && areasForResearch.length > 0) {
        contextInfo += `
          Areas Needing Further Research: ${areasForResearch.join(', ')}
        `;
      }
    }
    
    // Different prompts for initial vs subsequent iterations
    let systemPrompt;
    
    if (iteration === 1) {
      systemPrompt = `You are a research query generator for a prediction market platform. 
      Given a prediction market question and description, generate 3 search queries that would help research this topic.
      ${focusText ? `IMPORTANT: Focus specifically on researching: "${focusText}"` : ''}
      Focus on factual information that would help determine the likelihood of the event.
      Queries should be concise, specific, and varied to get a broad understanding of the topic.
      Output ONLY valid JSON in the following format:
      {
        "queries": [
          "first search query",
          "second search query", 
          "third search query"
        ]
      }`;
    } else {
      systemPrompt = `You are a research query generator for a prediction market platform.
      Based on previous analysis and identified areas needing further research, generate 3 NEW search queries that address knowledge gaps.
      ${focusText ? `IMPORTANT: Focus specifically on researching: "${focusText}"` : ''}
      Focus specifically on areas that need additional investigation based on previous research.
      Queries should be more targeted than previous iterations, diving deeper into unclear aspects.
      DO NOT repeat previous queries, but build upon what has been learned.
      Output ONLY valid JSON in the following format:
      {
        "queries": [
          "first refined search query",
          "second refined search query", 
          "third refined search query"
        ]
      }`;
    }
    
    console.log(`Sending request to OpenRouter with ${iteration > 1 ? 'refined' : 'initial'} query generation${focusText ? ` focused on: ${focusText.substring(0, 50)}...` : ''}`);
    
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
            queries = generateFallbackQueries(researchQuery, iteration, previousResults);
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
    
    // If extraction failed or no queries were found, fall back to smart fallback queries
    if (!queries.length || queries.every(q => q === "undefined" || q === undefined)) {
      console.log("Falling back to smart query generation");
      queries = generateFallbackQueries(researchQuery, iteration, previousResults);
    }
    
    // Clean up queries - remove excessive whitespace, truncate long queries
    queries = queries.map(q => {
      let cleanQuery = q.trim();
      // Limit query length to 150 chars for efficiency
      if (cleanQuery.length > 150) {
        cleanQuery = cleanQuery.substring(0, 150);
      }
      return cleanQuery;
    });
    
    console.log("Final generated queries:", queries);
    
    // Return the result
    return new Response(JSON.stringify({ queries }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error("Error in generate-queries function:", error);
    
    // Get the query from the request if possible
    let query = "unknown";
    let iteration = 1;
    try {
      const requestData = await req.json();
      query = requestData.query || requestData.question || "unknown";
      iteration = requestData.iteration || 1;
      const previousResults = requestData.previousResults || "";
      
      // Generate intelligent fallback queries
      const fallbackQueries = generateFallbackQueries(query, iteration, previousResults);
      
      return new Response(JSON.stringify({ queries: fallbackQueries }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (parseError) {
      // If we can't parse the request, use very basic fallback
      console.error("Error parsing request in fallback:", parseError);
      const basicFallbackQueries = [
        `${query} latest news`,
        `${query} analysis`,
        `${query} forecast`,
      ];
      
      return new Response(JSON.stringify({ queries: basicFallbackQueries }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
});

// Helper function to generate intelligent fallback queries based on iteration
function generateFallbackQueries(query: string, iteration: number, previousResults: string = ""): string[] {
  // Clean up query text
  const cleanQuery = query.trim();
  
  // Extract key terms (simple approach)
  const words = cleanQuery.split(/\s+/).filter(word => 
    word.length > 3 && 
    !['this', 'that', 'will', 'with', 'from', 'have', 'been', 'were', 'when', 'what', 'where'].includes(word.toLowerCase())
  );
  
  const keyTerms = words.slice(0, 5).join(' ');
  
  if (iteration === 1) {
    // First iteration - general exploration
    return [
      `${keyTerms} recent developments`,
      `${keyTerms} analysis prediction`,
      `${keyTerms} expert opinion`,
    ];
  } else if (iteration === 2) {
    // Second iteration - more targeted based on topic
    // Look for potential entities in the query
    const potentialEntities = words.filter(word => 
      word.length > 2 && word[0] === word[0].toUpperCase()
    ).slice(0, 2).join(' ');
    
    return [
      `${potentialEntities || keyTerms} latest data`,
      `${keyTerms} future outlook`,
      `${keyTerms} probability estimates`,
    ];
  } else {
    // Third+ iteration - focus on specifics and filling gaps
    // If we have previous results, extract some key terms
    const prevTerms = previousResults 
      ? extractKeyTermsFromText(previousResults) 
      : keyTerms;
    
    return [
      `${prevTerms} statistical analysis`,
      `${keyTerms} historical precedent`,
      `${keyTerms} expert forecast`,
    ];
  }
}

// Helper to extract key terms from previous analysis text
function extractKeyTermsFromText(text: string): string {
  // Simple extraction of capitalized multi-word phrases
  const matches = text.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
  
  if (matches.length > 0) {
    return matches[0];
  }
  
  // Fallback: find sentences with "need" or "missing" or "unclear"
  const sentences = text.split(/[.!?]+/).filter(s => 
    s.toLowerCase().includes('need') || 
    s.toLowerCase().includes('missing') || 
    s.toLowerCase().includes('unclear')
  );
  
  if (sentences.length > 0) {
    // Extract a few key words from the first relevant sentence
    const words = sentences[0].split(/\s+/).filter(w => 
      w.length > 4 && 
      !['needs', 'needed', 'need', 'missing', 'unclear', 'would', 'should', 'could'].includes(w.toLowerCase())
    ).slice(0, 3);
    
    return words.join(' ');
  }
  
  // Final fallback: just return first 2-3 substantial words
  const words = text.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  return words.join(' ');
}
