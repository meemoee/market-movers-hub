
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface RelatedMarket {
  market_id: string;
  question: string;
  probability: number;
  price_change?: number;
}

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
  relatedMarkets?: RelatedMarket[];
}

interface InsightsResponseData {
  probability: string;
  areasForResearch: string[];
  reasoning: {
    evidenceFor: string[];
    evidenceAgainst: string[];
    historicalPrecedents?: string[];
    resolutionAnalysis?: string;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
      marketPrice,
      relatedMarkets
    } = await req.json() as InsightsRequest;
    
    console.log(`Extract insights request for market ID ${marketId || 'unknown'}:`, {
      webContentLength: webContent?.length || 0,
      analysisLength: analysis?.length || 0,
      marketQuestion: marketQuestion?.substring(0, 100) || 'Not provided',
      previousAnalysesCount: previousAnalyses?.length || 0,
      iterationsCount: iterations?.length || 0,
      queriesCount: queries?.length || 0,
      areasForResearchCount: areasForResearch?.length || 0,
      focusText: focusText ? `${focusText.substring(0, 100)}...` : 'None specified',
      marketPrice: marketPrice || 'Not provided',
      relatedMarketsCount: relatedMarkets?.length || 0
    });

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    const contentLimit = 70000; // Arbitrary limit to prevent token overages
    const truncatedContent = webContent.length > contentLimit 
      ? webContent.substring(0, contentLimit) + "... [content truncated]" 
      : webContent;
    
    const truncatedAnalysis = analysis.length > 10000 
      ? analysis.substring(0, 10000) + "... [analysis truncated]" 
      : analysis;

    const previousAnalysesContext = previousAnalyses && previousAnalyses.length > 0
      ? `Previous iteration analyses:
${previousAnalyses.map((a, i) => `Iteration ${i+1}: ${a.substring(0, 2000)}${a.length > 2000 ? '...[truncated]' : ''}`).join('\n\n')}`
      : '';
    
    const queriesContext = queries && queries.length > 0
      ? `Search queries used: ${queries.join(', ')}`
      : '';
    
    const previousResearchAreas = areasForResearch && areasForResearch.length > 0
      ? `Previously identified research areas: ${areasForResearch.join(', ')}`
      : '';

    const isMarketResolved = marketPrice === 0 || marketPrice === 100;
    
    let marketPriceContext = '';
    if (marketPrice !== undefined) {
      if (isMarketResolved) {
        marketPriceContext = `\nIMPORTANT: The current market price for this event is ${marketPrice}%. This indicates the market considers this event as ${marketPrice === 100 ? 'already happened/resolved YES' : 'definitely not happening/resolved NO'}. Focus your analysis on explaining why this event ${marketPrice === 100 ? 'occurred' : 'did not occur'} rather than predicting probability.`;
      } else {
        marketPriceContext = `\nIMPORTANT: The current market price for this event is ${marketPrice}%. In prediction markets, this price reflects the market's current assessment of the probability that this event will occur. Consider how your evidence-based analysis compares to this market price.`;
      }
    }

    let relatedMarketsContext = '';
    if (relatedMarkets && relatedMarkets.length > 0) {
      relatedMarketsContext = "\nRelated markets and their current probabilities:\n";
      relatedMarkets.forEach(market => {
        const priceChangeInfo = market.price_change !== undefined ? 
          ` (${market.price_change > 0 ? '+' : ''}${(market.price_change * 100).toFixed(1)}pp change)` : '';
        relatedMarketsContext += `- "${market.question}": ${(market.probability * 100).toFixed(1)}%${priceChangeInfo}\n`;
      });
      relatedMarketsContext += "\nConsider how these related markets may affect your probability assessment. Are there dependencies or correlations between these markets and the main market?\n";
    }

    const marketContext = marketId && marketQuestion
      ? `\nYou are analyzing market ID: ${marketId} with the question: "${marketQuestion}"\n`
      : '';

    const focusContext = focusText
      ? `\nThe research particularly focused on: "${focusText}"\n`
      : '';

    const systemPrompt = `You are an expert market research analyst and probabilistic forecaster.${marketContext}${focusContext}
Your task is to analyze the provided web research and generate precise probability estimates based on concrete evidence.

CRITICAL GUIDELINES FOR PROBABILITY ASSESSMENT:
1. Use specific historical precedents and examples when supporting your analysis
2. Cite concrete evidence from the research
3. Identify key indicators and events that could affect outcome
4. When markets are already resolved (0% or 100%), explain the factors that led to that outcome
5. Acknowledge areas of uncertainty and their impact

Format your response as a JSON object with the following structure:
{
  "probability": "X%" (percentage with % sign),
  "areasForResearch": ["specific topic 1", "specific topic 2", ...] (2-5 specific areas that need more research),
  "reasoning": {
    "evidenceFor": ["specific evidence point 1", "specific evidence point 2", ...] (list specific evidence supporting the outcome),
    "evidenceAgainst": ["specific evidence point 1", "specific evidence point 2", ...] (list specific evidence against the outcome),
    "historicalPrecedents": ["precedent 1", "precedent 2", ...] (list relevant historical examples),
    "resolutionAnalysis": "Only for resolved markets - explain why the event did/didn't occur"
  }
}

IMPORTANT: Your response must be a valid JSON object.`;

    const prompt = `Here is the web content I've collected during research:
---
${truncatedContent}
---

And here is my analysis of this content:
---
${truncatedAnalysis}
---

${previousAnalysesContext}

Based on all this information, please provide:
1. A specific probability estimate for the market question: "${marketQuestion}"
2. The key areas where more research is needed
3. Detailed reasoning including:
   - Specific evidence points for and against the outcome
   - Relevant historical precedents and examples
   - For resolved markets (${marketPrice === 0 || marketPrice === 100 ? 'like this one' : 'not applicable here'}): analysis of why the event ${marketPrice === 100 ? 'occurred' : marketPrice === 0 ? 'did not occur' : 'may or may not occur'}
${relatedMarkets && relatedMarkets.length > 0 ? 
  `4. Analysis of how the following related markets affect your assessment:
${relatedMarkets.map(m => `   - "${m.question}": ${(m.probability * 100).toFixed(1)}%${m.price_change ? ` (${m.price_change > 0 ? '+' : ''}${(m.price_change * 100).toFixed(1)}pp change)` : ''}`).join('\n')}` 
  : ''}

Remember to format your response as a valid JSON object.`;

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
        probability: "Error: Could not analyze",
        areasForResearch: [],
        reasoning: {
          evidenceFor: [],
          evidenceAgainst: [],
          historicalPrecedents: [],
          resolutionAnalysis: "Could not analyze due to technical error"
        }
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
