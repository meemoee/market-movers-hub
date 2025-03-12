
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface RelatedMarket {
  market_id: string;
  question: string;
  probability: number;
  price_change?: number;
}

interface AnalysisRequest {
  content: string;
  query: string;
  question: string;
  marketId?: string;
  focusText?: string;
  previousAnalyses?: string;
  areasForResearch?: string[];
  marketPrice?: number;
  relatedMarkets?: RelatedMarket[];
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
      content, 
      query, 
      question, 
      marketId, 
      focusText,
      previousAnalyses,
      areasForResearch,
      marketPrice,
      relatedMarkets
    } = await req.json() as AnalysisRequest;
    
    console.log(`Analyze web content request for market ID ${marketId || 'unknown'}:`, {
      contentLength: content?.length || 0,
      query: query?.substring(0, 100) || 'Not provided',
      question: question?.substring(0, 100) || 'Not provided',
      focusText: focusText ? `${focusText.substring(0, 100)}...` : 'None specified',
      previousAnalysesLength: previousAnalyses?.length || 0,
      areasForResearchCount: areasForResearch?.length || 0,
      marketPrice: marketPrice || 'Not provided',
      relatedMarketsCount: relatedMarkets?.length || 0
    });

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    const contentLimit = 80000;
    const truncatedContent = content.length > contentLimit 
      ? content.substring(0, contentLimit) + "... [content truncated]" 
      : content;

    const marketContext = marketId
      ? `\nImportant context: You are analyzing content for prediction market ID: ${marketId}\n`
      : '';

    const focusContext = focusText
      ? `\nIMPORTANT: Focus your analysis specifically on: "${focusText}"\n`
      : '';

    const researchAreasContext = areasForResearch && areasForResearch.length > 0
      ? `\nPreviously identified research areas to focus on: ${areasForResearch.join(', ')}\n`
      : '';

    const isMarketResolved = marketPrice === 0 || marketPrice === 100;
    
    let marketPriceContext = '';
    if (marketPrice !== undefined) {
      if (isMarketResolved) {
        marketPriceContext = `\nThe current market price for this event is ${marketPrice}%, which indicates the market considers this event as ${marketPrice === 100 ? 'already happened/resolved YES' : 'definitely not happening/resolved NO'}. Focus your analysis on explaining why this event ${marketPrice === 100 ? 'occurred' : 'did not occur'} rather than predicting probability.\n`;
      } else {
        marketPriceContext = `\nThe current market price for this event is ${marketPrice}%, which in prediction markets reflects the market's assessment of the probability the event will occur. Keep this in mind during your analysis.\n`;
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
      relatedMarketsContext += "\nConsider how these related markets may inform your analysis. Look for correlations or dependencies between markets.\n";
    }

    const systemPrompt = `You are an expert market research analyst focused on evidence-based analysis.${marketContext}${focusContext}${researchAreasContext}${marketPriceContext}${relatedMarketsContext}

Your task is to analyze web content to assess the probability of market outcomes. Focus on:

1. Historical Precedents & Examples
   - Identify specific historical cases that have similarities to the current situation
   - Compare past outcomes to potential current outcomes
   - Note key differences that might affect probability

2. Concrete Evidence Assessment
   - Evaluate sources and their credibility
   - Highlight specific facts, statistics and data points
   - Note biases or limitations in the evidence

3. Key Factors Analysis
   - List major factors affecting probability
   - Analyze both supporting and contradicting evidence
   - Consider timing and dependencies between events

For markets already resolved (0% or 100%):
- Focus on explaining WHY the outcome occurred or didn't occur
- Identify the key factors that led to the final result

Be factual, precise, and evidence-based in your analysis. Cite specific examples, data points, and sources whenever possible.`;

    let prompt = `Here is the web content I've collected during research:
---
${truncatedContent}
---`;

    if (previousAnalyses && previousAnalyses.length > 0) {
      prompt += `\n\nPrevious research has identified the following insights:
---
${previousAnalyses.substring(0, 10000)}${previousAnalyses.length > 10000 ? '... [truncated]' : ''}
---`;
    }

    prompt += `\nBased solely on the information in this content:
1. What are the key facts and insights relevant to the market question "${question}"?
${focusText ? `1a. Specifically analyze aspects related to: "${focusText}"` : ''}
2. What specific evidence supports or contradicts the proposition?
${isMarketResolved ? 
  `3. Since the market price is ${marketPrice}%, which indicates the event has ${marketPrice === 100 ? 'already occurred' : 'definitely not occurred'}, explain what specific evidence supports this outcome.` : 
  `3. How does this specific information affect the probability assessment?`
}
4. What historical precedents or similar events are relevant to this analysis?
5. What conclusions can we draw about the ${isMarketResolved ? 'reasons for this outcome' : 'likely outcome'}?
${marketPrice !== undefined && !isMarketResolved ? `6. Does the current market price of ${marketPrice}% seem reasonable based on the evidence? Why or why not?` : ''}
${relatedMarkets && relatedMarkets.length > 0 ? `7. Are there any insights that might relate to the connected markets mentioned in context? Explain any potential correlations or dependencies.` : ''}

Ensure your analysis is factual, balanced, and directly addresses the market question. Include specific references to data, events, and sources from the content.`;

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
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
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
    console.error('Error in analyze-web-content:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
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
