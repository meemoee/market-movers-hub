
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

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
    const { 
      query, 
      previousResults, 
      iteration, 
      marketId, 
      marketDescription,
      previousAnalyses = [],
      areasNeedingResearch = [],
      isInitialQuery = false
    } = await req.json();

    console.log('Generate queries for:', marketDescription?.substring(0, 100));
    console.log('Iteration:', iteration);
    console.log('Areas needing research count:', areasNeedingResearch.length);
    console.log('Previous analyses count:', previousAnalyses.length);
    
    let systemPrompt = "";
    
    if (iteration === undefined || iteration === 1 || isInitialQuery) {
      systemPrompt = `You are a research assistant designing search queries for web research on a market prediction question. Your goal is to break down complex questions into effective search queries that will help gather information to make an accurate prediction.

Given a prediction market question, generate 3-5 specific, targeted search queries.
- Create diverse queries that explore different aspects of the question
- Use clear, succinct phrases that will yield relevant results
- Avoid redundancy across queries
- Consider what a user would type into a search engine for the most relevant results
- DO NOT include the marketId in the queries
- DO NOT include timestamps or dates unless they're part of the question`;
    } else {
      // For iterations 2+, focus on building upon previous analyses and targeting areas needing more research
      systemPrompt = `You are a research assistant refining search queries based on prior research. Your goal is to generate targeted queries that address specific gaps in knowledge identified in previous analysis rounds.

Analyze the previous research rounds and generate 3-5 specific, targeted search queries that:
1. Specifically address areas identified as needing further research or clarification
2. Target knowledge gaps in the previous analyses
3. Seek information that was missing or uncertain in previous rounds
4. Explore contradictory information that needs resolution
5. Focus on the most critical aspects that remain unclear for making an accurate prediction

- DO NOT repeat previous queries
- Use clear, succinct phrases that will yield relevant results
- DO NOT include the marketId in the queries
- Each query should target a specific knowledge gap identified in prior analysis`;
    }

    const userPrompt = iteration === 1 || isInitialQuery
      ? `Generate effective search queries for this prediction market question: "${query || marketDescription}"`
      : `Based on the previous analysis${previousAnalyses.length > 0 ? 'es' : ''} of our research on: "${query || marketDescription}"

${previousResults ? `\nMost recent analysis:\n${previousResults}\n` : ''}

${previousAnalyses.length > 0 ? `\nPrevious analyses:\n${previousAnalyses.join('\n\n')}\n` : ''}

${areasNeedingResearch.length > 0 ? `\nSpecific areas identified as needing more research:\n${areasNeedingResearch.join('\n')}\n` : ''}

Generate 3-5 targeted search queries that specifically address the gaps in our current understanding and areas that need further research. Each query should target a specific aspect that remains unclear or needs more evidence.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Extract the queries from the response
    const queries = content
      .split(/\n+/)
      .filter(line => 
        /^\d+[\.\)]\s/.test(line) || 
        /^".*?"$/.test(line) || 
        /^-\s/.test(line) ||
        /^Query\s+\d+:/.test(line)
      )
      .map(line => 
        line
          .replace(/^\d+[\.\)]\s+/, '')
          .replace(/^-\s+/, '')
          .replace(/^Query\s+\d+:\s*/, '')
          .replace(/^"|"$/g, '')
          .trim()
      )
      .filter(query => query.length > 0 && query.length < 300);
    
    // If no queries were extracted, fall back to the entire content
    const finalQueries = queries.length > 0 
      ? queries 
      : [content.substring(0, 200)];
      
    console.log(`Generated ${finalQueries.length} queries for iteration ${iteration}`);
    finalQueries.forEach((q, i) => console.log(`Query ${i+1}: ${q}`));

    return new Response(
      JSON.stringify({
        queries: finalQueries,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in generate-queries function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
