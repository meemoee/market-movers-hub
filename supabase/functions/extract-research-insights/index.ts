
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface InsightsRequest {
  webContent: string;
  analysis: string;
  marketId?: string; 
  marketQuestion?: string;
  previousAnalyses?: string[];
  iterations?: any[];
  queries?: string[];
  areasForResearch?: string[];
  focusText?: string;
  marketPrice?: number;
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
    const { 
      webContent, 
      analysis, 
      marketId, 
      marketQuestion,
      previousAnalyses,
      iterations,
      queries,
      areasForResearch,
      focusText,
      marketPrice
    } = await req.json() as InsightsRequest;
    
    // Log request info for debugging
    console.log(`Extract insights request for market ID ${marketId || 'unknown'}:`, {
      webContentLength: webContent?.length || 0,
      analysisLength: analysis?.length || 0,
      marketQuestion: marketQuestion?.substring(0, 100) || 'Not provided',
      previousAnalysesCount: previousAnalyses?.length || 0,
      iterationsCount: iterations?.length || 0,
      queriesCount: queries?.length || 0,
      areasForResearchCount: areasForResearch?.length || 0,
      focusText: focusText ? `${focusText.substring(0, 100)}...` : 'None specified',
      marketPrice: marketPrice || 'Not provided'
    });

    // Get OpenRouter API key
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    // Set up content limiter to prevent tokens from being exceeded
    const contentLimit = 70000; // Arbitrary limit to prevent token overages
    const truncatedContent = webContent.length > contentLimit 
      ? webContent.substring(0, contentLimit) + "... [content truncated]" 
      : webContent;
    
    const truncatedAnalysis = analysis.length > 10000 
      ? analysis.substring(0, 10000) + "... [analysis truncated]" 
      : analysis;

    // Prepare previous analyses for context
    const previousAnalysesContext = previousAnalyses && previousAnalyses.length > 0
      ? `Previous iteration analyses:
${previousAnalyses.map((a, i) => `Iteration ${i+1}: ${a.substring(0, 2000)}${a.length > 2000 ? '...[truncated]' : ''}`).join('\n\n')}`
      : '';
    
    // Prepare queries context
    const queriesContext = queries && queries.length > 0
      ? `Search queries used: ${queries.join(', ')}`
      : '';
    
    // Prepare previous research areas
    const previousResearchAreas = areasForResearch && areasForResearch.length > 0
      ? `Previously identified research areas: ${areasForResearch.join(', ')}`
      : '';

    // Check if market is already resolved (price is 0% or 100%)
    const isMarketResolved = marketPrice === 0 || marketPrice === 100;
    
    // Add market price context with special handling for resolved markets
    let marketPriceContext = '';
    if (marketPrice !== undefined) {
      if (isMarketResolved) {
        marketPriceContext = `\nIMPORTANT: The current market price for this event is ${marketPrice}%. This indicates the market considers this event as ${marketPrice === 100 ? 'already happened/resolved YES' : 'definitely not happening/resolved NO'}. Focus your analysis on explaining why this event ${marketPrice === 100 ? 'occurred' : 'did not occur'} rather than predicting probability.`;
      } else {
        marketPriceContext = `\nIMPORTANT: The current market price for this event is ${marketPrice}%. In prediction markets, this price reflects the market's current assessment of the probability that this event will occur. Consider how your evidence-based analysis compares to this market price.`;
      }
    }

    // Create a system prompt that emphasizes the specific market context
    const marketContext = marketId && marketQuestion
      ? `\nYou are analyzing market ID: ${marketId} with the question: "${marketQuestion}"\n`
      : '';

    const focusContext = focusText
      ? `\nThe research particularly focused on: "${focusText}"\n`
      : '';

    const systemPrompt = `You are an expert market research analyst and probabilistic forecaster.${marketContext}${focusContext}
Your task is to analyze web research content and provide precise insights about prediction market outcomes.
${previousResearchAreas}
${queriesContext}
${marketPriceContext}

${isMarketResolved ? `Since the market price is ${marketPrice}%, this market has likely resolved. You should explain the evidence for WHY this event ${marketPrice === 100 ? 'occurred' : 'did not occur'} rather than providing a probability estimate.` : 'Based on your comprehensive analysis, provide a specific probability estimate (a percentage) for the market outcome.'}

Format your answer as a JSON object with the following structure:
{
  ${isMarketResolved ? 
    `"probability": "${marketPrice}%",` : 
    `"probability": "X%" (numerical percentage with % sign),`
  }
  "areasForResearch": ["area 1", "area 2", "area 3", ...] (specific research areas as an array of strings),
  "reasoning": "brief explanation of ${isMarketResolved ? 'why this event occurred or did not occur' : 'your reasoning behind the probability estimate'}"
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

${previousAnalysesContext}

Based on all this information:
${isMarketResolved ?
  `1. The market price is ${marketPrice}%, indicating this event has ${marketPrice === 100 ? 'already occurred' : 'definitely not occurred'}. Explain the key evidence supporting this outcome.` :
  `1. What is your best estimate of the probability this market event will occur? Give a specific percentage.`
}
2. What are the most important areas where more research is needed to improve prediction accuracy?
3. Summarize the key evidence and reasoning behind your ${isMarketResolved ? 'explanation' : 'probability estimate'} in 2-3 sentences.

${marketPrice !== undefined ? 
  isMarketResolved ?
    `Remember that the current market price is ${marketPrice}%, which means the market considers this event as ${marketPrice === 100 ? 'resolved YES' : 'resolved NO'}. Your task is to explain WHY based on the evidence.` :
    `Remember that the current market price is ${marketPrice}%, which represents the market's assessment of probability. Consider how your evidence-based analysis compares to this assessment.` 
  : ''}

Remember to respond with a valid JSON object with "probability", "areasForResearch", and "reasoning" properties.`;

    // Make the streaming request with Gemini model
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Hunchex Analysis'
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: true,
        temperature: 0.2,
        response_format: { type: "json_object" }
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
    
    // Return a structured error format that won't cause parsing flashes
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        probability: "Error: Could not analyze",
        areasForResearch: [],
        reasoning: "Could not analyze due to technical error"
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
