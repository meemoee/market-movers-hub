
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface InsightsRequest {
  webContent: string;
  analysis: string;
  marketId?: string; 
  marketQuestion?: string;
}

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
    const { webContent, analysis, marketId, marketQuestion } = await req.json() as InsightsRequest;
    
    // Log request info for debugging
    console.log(`Extract insights request for market ID ${marketId || 'unknown'}:`, {
      webContentLength: webContent?.length || 0,
      analysisLength: analysis?.length || 0,
      marketQuestion: marketQuestion?.substring(0, 100) || 'Not provided'
    });

    // Determine which API to use
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openAIKey && !openRouterKey) {
      throw new Error('No API keys configured for LLM services');
    }

    // Choose OpenAI or OpenRouter based on available keys
    const apiKey = openAIKey || openRouterKey;
    const apiEndpoint = openAIKey 
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    
    // Determine auth header based on which service we're using
    const authHeader = openAIKey
      ? { 'Authorization': `Bearer ${apiKey}` }
      : { 'HTTP-Referer': 'https://hunchex.com', 'X-Title': 'Hunchex Analysis', 'Authorization': `Bearer ${apiKey}` };

    // Set up content limiter to prevent tokens from being exceeded
    const contentLimit = 70000; // Arbitrary limit to prevent token overages
    const truncatedContent = webContent.length > contentLimit 
      ? webContent.substring(0, contentLimit) + "... [content truncated]" 
      : webContent;
    
    const truncatedAnalysis = analysis.length > 10000 
      ? analysis.substring(0, 10000) + "... [analysis truncated]" 
      : analysis;

    // Create a system prompt that emphasizes the specific market context
    const marketContext = marketId && marketQuestion
      ? `\nYou are analyzing market ID: ${marketId} with the question: "${marketQuestion}"\n`
      : '';

    const systemPrompt = `You are an expert market research analyst and probabilistic forecaster.${marketContext}
Your task is to analyze web research content and provide precise insights about prediction market outcomes.
Based on your analysis, provide:
1. A specific probability estimate (a percentage) for the market outcome
2. A list of key areas that require additional research to improve confidence

Format your answer as a JSON object with the following structure:
{
  "probability": "X%" (numerical percentage with % sign),
  "areasForResearch": ["area 1", "area 2", "area 3", ...] (specific research areas as an array of strings)
}`;

    // Create a longer version of the prompt for a more nuanced response
    const prompt = `Here is the web content I've collected during research:
---
${truncatedContent}
---

And here is my analysis of this content:
---
${truncatedAnalysis}
---

Based on all this information:
1. What is your best estimate of the probability this market event will occur? Give a specific percentage.
2. What are the most important areas where more research is needed to improve prediction accuracy?

Remember to respond with a valid JSON object with "probability" and "areasForResearch" properties.`;

    // Make the streaming request
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openAIKey ? 'gpt-4o-mini' : 'perplexity/llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: true,
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} ${errorText}`);
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    // Return the streaming response directly
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
      }
    });
  } catch (error) {
    console.error('Error in extract-research-insights:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        probability: "50%",
        areasForResearch: ["Error resolution", "Technical issues"]
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
