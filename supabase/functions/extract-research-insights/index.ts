
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

interface RelatedMarket {
  market_id: string;
  question: string;
  probability: number;
  price_change?: number;
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
      queries,
      iterations,
      areasForResearch,
      marketPrice,
      relatedMarkets
    } = await req.json();

    console.log("Extract research insights called for:", {
      contentLength: webContent?.length || 0,
      analysisLength: analysis?.length || 0,
      marketId: marketId || "not provided",
      marketQuestionLength: marketQuestion?.length || 0,
      previousAnalysesLength: previousAnalyses?.length || 0,
      queriesCount: queries?.length || 0,
      iterationsCount: iterations?.length || 0,
      areasForResearchCount: areasForResearch?.length || 0,
      marketPrice,
      relatedMarketsCount: relatedMarkets?.length || 0
    });

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      throw new Error("API key not configured");
    }

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
      relatedMarkets.forEach((market: RelatedMarket) => {
        const priceChangeInfo = market.price_change !== undefined ? 
          ` (${market.price_change > 0 ? '+' : ''}${(market.price_change * 100).toFixed(1)}pp change)` : '';
        relatedMarketsContext += `- "${market.question}": ${(market.probability * 100).toFixed(1)}%${priceChangeInfo}\n`;
      });
      relatedMarketsContext += "\nConsider how these related markets may inform your analysis.\n";
    }

    const systemPrompt = `You are an expert market research analyst skilled at distilling complex information into clear, evidence-based probability estimates.

Your task is to analyze research on a prediction market question and extract:
1. A specific probability assessment or explanation for resolved markets
2. Key evidence points organized by whether they support or contradict the proposition
3. Relevant historical precedents with specific details
4. For resolved markets, explanation of key factors that determined the outcome
5. Areas needing further research

${marketPriceContext}${relatedMarketsContext}

FORMAT YOUR RESPONSE AS JSON ONLY with the following structure:
{
  "probability": "Your assessment as a percentage or explanation",
  "areasForResearch": ["specific area 1", "specific area 2", ...],
  "evidenceFor": ["specific supporting evidence 1", "specific supporting evidence 2", ...],
  "evidenceAgainst": ["specific contradicting evidence 1", "specific contradicting evidence 2", ...],
  "historicalPrecedents": ["specific historical precedent 1", "specific historical precedent 2", ...],
  "resolutionAnalysis": "For resolved markets, explanation of outcome factors"
}

Be factual, precise, and evidence-based. Cite specific examples, data points, and sources.`;

    const userPrompt = `I need you to analyze this research data and extract key insights regarding the question: "${marketQuestion}".

Research Analysis:
${analysis}

${areasForResearch?.length ? `Previously identified areas needing research: ${areasForResearch.join(', ')}` : ''}

${isMarketResolved 
  ? `This market has resolved ${marketPrice === 100 ? 'YES' : 'NO'} (${marketPrice}%). Explain why this outcome occurred based on the evidence.` 
  : `Based solely on the evidence, what is your probability assessment for this question?`
}

Return your response in JSON format with:
- probability (your assessment)
- areasForResearch (array of specific topics needing more investigation)
- evidenceFor (array of specific evidence supporting the proposition)
- evidenceAgainst (array of specific evidence contradicting the proposition)
- historicalPrecedents (array of relevant historical examples)
- resolutionAnalysis (for resolved markets, explanation of outcome factors)

The JSON response should be comprehensive but focused on the most important factors.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hunchex.com",
        "X-Title": "Hunchex - Extract Research Insights"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    console.error("Error in extract-research-insights:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Unknown error",
        probability: "Error occurred",
        areasForResearch: ["Error processing research data"],
        evidenceFor: [],
        evidenceAgainst: [],
        historicalPrecedents: [],
        resolutionAnalysis: "Error occurred during analysis"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
