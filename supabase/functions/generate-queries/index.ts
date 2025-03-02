
// Follow imports from the original file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.31.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? '';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    const { 
      query, 
      previousResults = '', 
      previousAnalyses = [], 
      iteration = 1,
      marketId = '',
      marketDescription = '',
      areasNeedingResearch = [],
      isInitialIteration = false
    } = requestData;

    console.log("Generate queries request:", { 
      queryLength: query?.length, 
      iteration, 
      marketId,
      isInitialIteration,
      hasAreasNeedingResearch: Array.isArray(areasNeedingResearch) && areasNeedingResearch.length > 0
    });

    let prompt;
    
    if (isInitialIteration) {
      // Prompt for initial iteration - need to create focused, short queries
      prompt = `
You are a research assistant helping to gather information about a prediction market question.

MARKET QUESTION: "${query}"

Your goal is to generate 5 DISTINCT and FOCUSED search queries that will help gather relevant information about this market question.

IMPORTANT GUIDELINES:
1. Each query should be 3-7 words long and focus on a specific aspect of the question
2. Do NOT include the full market question text in your queries
3. Focus on key entities, events, and concepts from the question
4. Include different time frames (recent, historical)
5. Consider different perspectives (expert analysis, official information, news)
6. Avoid redundancy between queries
7. Extract the essential aspects that need to be researched

RESPONSE FORMAT:
Return a JSON array of 5 strings, each representing a search query.
Example: ["key term analysis", "entity1 relationship entity2", "recent developments key concept", "historical precedent", "expert forecasts term"]
`;
    } else {
      // Prompt for subsequent iterations - build on previous analysis
      const combinedAnalyses = Array.isArray(previousAnalyses) 
        ? previousAnalyses.join("\n\n===NEXT ANALYSIS===\n\n") 
        : '';
      
      const areasNeedingResearchText = Array.isArray(areasNeedingResearch) && areasNeedingResearch.length > 0
        ? `\nAREAS IDENTIFIED AS NEEDING FURTHER RESEARCH:\n${areasNeedingResearch.map((area, index) => `${index + 1}. ${area}`).join('\n')}`
        : '';
      
      prompt = `
You are a research assistant working on iteration ${iteration} of a research process for a prediction market question.

MARKET QUESTION: "${query}"

PREVIOUS ANALYSIS:
${previousResults || combinedAnalyses || "No previous analysis available."}
${areasNeedingResearchText}

Your task is to generate 5 TARGETED search queries that address GAPS in knowledge from previous research iterations. Focus on:
1. Areas explicitly mentioned as needing further investigation
2. Contradictions or uncertainties in the previous analysis
3. Important aspects not covered in detail yet
4. Updates or new developments since previous research
5. Specific evidence needed to assess probability

IMPORTANT GUIDELINES:
- Make queries CONCISE (3-7 words) and highly SPECIFIC
- Avoid broad or general topics already well-covered
- Each query should target a DIFFERENT aspect needing investigation
- Do NOT include the full market description in the queries
- Focus on addressing the most important knowledge gaps

RESPONSE FORMAT:
Return a JSON array of 5 strings, each representing a focused search query.
Example: ["specific aspect investigation", "key uncertainty evidence", "contradicting data analysis", "missing timeframe information", "probability factor research"]
`;
    }

    console.log("Using OpenRouter for query generation");
    
    // Use OpenRouter for query generation
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://example.com',
        'X-Title': 'Generate Research Queries',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: [
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.5,
      }),
    });

    const data = await response.json();
    
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from AI provider: ' + JSON.stringify(data));
    }

    let generatedContent = data.choices[0]?.message?.content || '';
    console.log('Generated content:', generatedContent);

    // Try to extract JSON array from the response
    let queries = [];
    try {
      // Look for JSON array in the response
      const jsonMatch = generatedContent.match(/\[\s*"[^"]+(?:",\s*"[^"]+")*\s*\]/);
      if (jsonMatch) {
        queries = JSON.parse(jsonMatch[0]);
      } else if (generatedContent.includes('[') && generatedContent.includes(']')) {
        // Try to extract from markdown code blocks
        const codeBlockMatch = generatedContent.match(/```(?:json)?\s*(\[\s*"[^"]+(?:",\s*"[^"]+")*\s*\])\s*```/);
        if (codeBlockMatch) {
          queries = JSON.parse(codeBlockMatch[1]);
        }
      }
    } catch (e) {
      console.error('Error parsing queries:', e);
    }

    // If we couldn't parse valid queries, try a fallback approach
    if (!Array.isArray(queries) || queries.length === 0) {
      console.log('Parsing JSON failed, extracting lines manually');
      // Extract lines that look like queries
      const lines = generatedContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length < 100 && !line.startsWith('#') && !line.match(/^\d+\./))
        .map(line => line.replace(/^["'-]+|["'-]+$/g, '').trim());
      
      queries = [...new Set(lines)].slice(0, 5);
    }

    // Ensure we have 5 queries, add fallbacks if needed
    if (queries.length < 5) {
      const fallbackQueries = [
        "latest developments",
        "expert analysis",
        "recent updates",
        "probability factors",
        "evidence analysis"
      ];
      
      while (queries.length < 5) {
        queries.push(fallbackQueries[queries.length % fallbackQueries.length]);
      }
    }

    // Ensure queries are appropriate length and unique
    queries = [...new Set(queries)].map(q => q.length > 200 ? q.substring(0, 200) : q);
    
    console.log("Generated queries:", queries);

    return new Response(
      JSON.stringify({ queries }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating queries:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
