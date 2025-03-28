
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

interface InsightsResponse {
  probability: string;
  areasForResearch: string[];
  reasoning: {
    evidenceFor: string[];
    evidenceAgainst: string[];
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Main entry point for the extract-research-insights function
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json() as InsightsRequest;
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
    } = requestData;
    
    logRequestDetails(requestData);

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    // Get current date in a readable format
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Prepare content and data for the prompt
    const contentAndContext = prepareContentAndContext({
      webContent,
      analysis,
      marketId,
      marketQuestion,
      previousAnalyses,
      focusText,
      marketPrice,
      relatedMarkets,
      queries,
      currentDate
    });

    // Generate system prompt and user prompt
    const systemPrompt = buildSystemPrompt(contentAndContext);
    const prompt = buildPrompt(contentAndContext);

    // Get insights with retry logic
    const results = await getInsightsWithRetry(
      systemPrompt,
      prompt,
      openRouterKey,
      3
    );
    
    // Extract the insights data from the response
    const insightsData = results.insights;
    
    return new Response(JSON.stringify({
      ...results,
      choices: [{
        ...results.choices?.[0],
        message: {
          ...results.choices?.[0]?.message,
          content: insightsData
        }
      }]
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.error('Error in extract-research-insights:', error);
    
    return new Response(
      JSON.stringify(createErrorResponse(error.message)),
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

/**
 * Log request details for debugging
 */
function logRequestDetails(requestData: InsightsRequest): void {
  console.log(`Extract insights request for market ID ${requestData.marketId || 'unknown'}:`, {
    webContentLength: requestData.webContent?.length || 0,
    analysisLength: requestData.analysis?.length || 0,
    marketQuestion: requestData.marketQuestion?.substring(0, 100) || 'Not provided',
    previousAnalysesCount: requestData.previousAnalyses?.length || 0,
    iterationsCount: requestData.iterations?.length || 0,
    queriesCount: requestData.queries?.length || 0,
    areasForResearchCount: requestData.areasForResearch?.length || 0,
    focusText: requestData.focusText ? `${requestData.focusText.substring(0, 100)}...` : 'None specified',
    marketPrice: requestData.marketPrice || 'Not provided',
    relatedMarketsCount: requestData.relatedMarkets?.length || 0
  });
}

/**
 * Create error response object
 */
function createErrorResponse(errorMessage: string): InsightsResponse {
  return {
    probability: "Error: Could not analyze",
    areasForResearch: [],
    reasoning: {
      evidenceFor: [],
      evidenceAgainst: []
    }
  };
}

/**
 * Prepare content and context for the prompt
 */
function prepareContentAndContext(data: {
  webContent: string;
  analysis: string;
  marketId?: string;
  marketQuestion?: string;
  previousAnalyses?: string[];
  focusText?: string;
  marketPrice?: number;
  relatedMarkets?: RelatedMarket[];
  queries?: string[];
  currentDate: string;
}) {
  const contentLimit = 70000; // Arbitrary limit to prevent token overages
  const truncatedContent = data.webContent.length > contentLimit 
    ? data.webContent.substring(0, contentLimit) + "... [content truncated]" 
    : data.webContent;
  
  const truncatedAnalysis = data.analysis.length > 10000 
    ? data.analysis.substring(0, 10000) + "... [analysis truncated]" 
    : data.analysis;

  const previousAnalysesContext = data.previousAnalyses && data.previousAnalyses.length > 0
    ? `Previous iteration analyses:
${data.previousAnalyses.map((a, i) => `Iteration ${i+1}: ${a.substring(0, 2000)}${a.length > 2000 ? '...[truncated]' : ''}`).join('\n\n')}`
    : '';
  
  const queriesContext = data.queries && data.queries.length > 0
    ? `Search queries used: ${data.queries.join(', ')}`
    : '';

  const isMarketResolved = data.marketPrice === 0 || data.marketPrice === 100;
  
  let marketPriceContext = '';
  if (data.marketPrice !== undefined) {
    if (isMarketResolved) {
      marketPriceContext = `\nIMPORTANT: The current market price for this event is ${data.marketPrice}%. This indicates the market considers this event as ${data.marketPrice === 100 ? 'already happened/resolved YES' : 'definitely not happening/resolved NO'}. Focus your analysis on explaining why this event ${data.marketPrice === 100 ? 'occurred' : 'did not occur'} rather than predicting probability.`;
    } else {
      marketPriceContext = `\nIMPORTANT: The current market price for this event is ${data.marketPrice}%. In prediction markets, this price reflects the market's current assessment of the probability that this event will occur. Consider how your evidence-based analysis compares to this market price.`;
    }
  }

  let relatedMarketsContext = '';
  if (data.relatedMarkets && data.relatedMarkets.length > 0) {
    relatedMarketsContext = "\nRelated markets and their current probabilities:\n";
    data.relatedMarkets.forEach(market => {
      const priceChangeInfo = market.price_change !== undefined ? 
        ` (${market.price_change > 0 ? '+' : ''}${(market.price_change * 100).toFixed(1)}pp change)` : '';
      relatedMarketsContext += `- "${market.question}": ${(market.probability * 100).toFixed(1)}%${priceChangeInfo}\n`;
    });
    relatedMarketsContext += "\nConsider how these related markets may affect your probability assessment. Are there dependencies or correlations between these markets and the main market?\n";
  }

  const marketContext = data.marketId && data.marketQuestion
    ? `\nYou are analyzing market ID: ${data.marketId} with the question: "${data.marketQuestion}"\n`
    : '';

  const focusContext = data.focusText
    ? `\nCRITICAL: This analysis is specifically focused on: "${data.focusText}"\nYou MUST ensure ALL evidence points directly address this specific focus area.\n`
    : '';

  const dateContext = `\nTODAY'S DATE: ${data.currentDate}\nWhen generating probability estimates, consider the temporal relevance of information relative to today's date. Be explicit about how the recency or timeliness of information impacts your assessment.\n`;

  return {
    truncatedContent,
    truncatedAnalysis,
    previousAnalysesContext,
    queriesContext,
    marketPriceContext,
    relatedMarketsContext,
    marketContext,
    focusContext,
    dateContext,
    currentDate: data.currentDate,
    marketQuestion: data.marketQuestion,
    focusText: data.focusText,
    relatedMarkets: data.relatedMarkets
  };
}

/**
 * Build the system prompt for the model
 */
function buildSystemPrompt(content: ReturnType<typeof prepareContentAndContext>): string {
  return `You are an expert market research analyst and probabilistic forecaster.${content.marketContext}${content.focusContext}${content.dateContext}
Your task is to analyze the provided web research and generate precise probability estimates based on concrete evidence.

CRITICAL GUIDELINES FOR PROBABILITY ASSESSMENT:
1. Historical Precedents: Always cite specific historical events, statistics, or past occurrences that inform your estimate
2. Key Conditions: Identify and analyze the specific conditions that must be met for the event to occur
3. Impact Factors: List the major factors that could positively or negatively impact the probability
4. Evidence Quality: Assess the reliability and relevance of your sources
5. Uncertainty: Acknowledge key areas of uncertainty and how they affect your estimate
6. Competitive Analysis: When relevant, analyze competitor positions and market dynamics
7. Timeline Considerations: Account for time-dependent factors and how they affect probability
8. Temporal Relevance: Consider how the recency of information (relative to today, ${content.currentDate}) affects your probability assessment
${content.focusText ? `9. FOCUS AREA: Every evidence point MUST explicitly connect to the focus area: "${content.focusText}". Prioritize evidence that directly addresses this specific aspect.\n` : ''}

Format your analysis as a JSON object with:
{
  "probability": "X%" (numerical percentage with % sign),
  "areasForResearch": ["area 1", "area 2", "area 3", ...] (specific research areas as an array of strings),
  "reasoning": {
    "evidenceFor": [
      "Detailed point 1 supporting the event happening, with specific examples, statistics, or historical precedents${content.focusText ? ` that directly addresses the focus area: "${content.focusText}"` : ''}",
      "Detailed point 2 supporting the event happening"
      // Add multiple points as needed
    ],
    "evidenceAgainst": [
      "Detailed point 1 against the event happening, with specific examples, statistics, or historical precedents${content.focusText ? ` that directly addresses the focus area: "${content.focusText}"` : ''}",
      "Detailed point 2 against the event happening"
      // Add multiple points as needed
    ]
  }
}

IMPORTANT:
- In the "evidenceFor" and "evidenceAgainst" arrays, include detailed points with specific examples, historical precedents, statistics, and source citations where available.
- For resolved markets (0% or 100%), focus on explaining why the event did or didn't happen rather than probability assessment.
- Consider all dimensions of the question including economic, political, social, and technological factors.
- Each evidence point should be a complete, well-reasoned argument, not just a simple statement.
- Evaluate the temporal relevance of all evidence - clearly indicate when information may be outdated relative to today (${content.currentDate}).${content.focusText ? `\n- EVERY evidence point MUST explicitly address the focus area: "${content.focusText}". If evidence doesn't directly relate to this focus, it should be excluded or clearly connected to the focus.` : ''}`;
}

/**
 * Build user prompt for the model
 */
function buildPrompt(content: ReturnType<typeof prepareContentAndContext>): string {
  return `Here is the web content I've collected during research:
---
${content.truncatedContent}
---

And here is my analysis of this content:
---
${content.truncatedAnalysis}
---

${content.previousAnalysesContext}

TODAY'S DATE: ${content.currentDate}

Based on all this information, please provide:
1. A specific probability estimate for the market question: "${content.marketQuestion}"
2. The key areas where more research is needed
3. A detailed reasoning section with:
   - Evidence FOR the event happening (with specific historical precedents, examples, statistics)
   - Evidence AGAINST the event happening (with specific historical precedents, examples, statistics)
4. Consider the temporal relevance of all evidence relative to today's date (${content.currentDate})
${content.focusText ? `\nCRITICAL: Your analysis MUST focus specifically on: "${content.focusText}"\nEnsure ALL evidence points directly address this specific focus area.\n` : ''}
${content.relatedMarkets && content.relatedMarkets.length > 0 ? 
  `5. Analysis of how the following related markets affect your assessment:
${content.relatedMarkets.map(m => `   - "${m.question}": ${(m.probability * 100).toFixed(1)}%${m.price_change ? ` (${m.price_change > 0 ? '+' : ''}${(m.price_change * 100).toFixed(1)}pp change)` : ''}`).join('\n')}` 
  : ''}

Remember to format your response as a valid JSON object with probability, areasForResearch, and reasoning fields.`;
}

/**
 * Validate JSON response format
 */
function isValidInsightsResponse(data: any): boolean {
  if (!data) return false;
  
  try {
    // Check if we have the minimum required fields
    if (typeof data.probability !== 'string') return false;
    if (!Array.isArray(data.areasForResearch)) return false;
    
    // Check if reasoning exists and has the correct structure
    if (!data.reasoning) return false;
    if (!Array.isArray(data.reasoning.evidenceFor) && !Array.isArray(data.reasoning.evidenceAgainst)) {
      // If neither evidenceFor nor evidenceAgainst is an array, check if reasoning is a string
      return typeof data.reasoning === 'string';
    }
    
    return true;
  } catch (e) {
    console.error('Error validating response format:', e);
    return false;
  }
}

/**
 * Get insights with retry logic
 */
async function getInsightsWithRetry(
  systemPrompt: string, 
  prompt: string,
  openRouterKey: string,
  maxRetries = 3
): Promise<any> {
  let retryCount = 0;
  let responseData;
  let validResponse = false;
  
  while (retryCount < maxRetries && !validResponse) {
    try {
      console.log(`Attempt #${retryCount + 1} to get insights from OpenRouter`);
      
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
          stream: false,
          temperature: 0.2,
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error: ${response.status} ${errorText}`);
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      // Log the full raw response for debugging
      const rawResponseText = await response.text();
      console.log(`OpenRouter raw response (attempt #${retryCount + 1}):`, rawResponseText);
      
      try {
        // Parse the raw response text
        responseData = JSON.parse(rawResponseText);
        console.log(`OpenRouter parsed response structure (attempt #${retryCount + 1}):`, 
          JSON.stringify(Object.keys(responseData)));
        
        // Extract the actual model output
        const modelContent = responseData?.choices?.[0]?.message?.content;
        console.log(`Model content (attempt #${retryCount + 1}):`, 
          typeof modelContent === 'string' ? modelContent.substring(0, 500) + '...' : modelContent);
        
        let insightsData;
        
        // Try to parse the content if it's a string
        if (typeof modelContent === 'string') {
          try {
            insightsData = JSON.parse(modelContent);
            console.log(`Parsed insights data structure (attempt #${retryCount + 1}):`, 
              JSON.stringify(Object.keys(insightsData)));
          } catch (parseError) {
            console.error(`Error parsing model content as JSON (attempt #${retryCount + 1}):`, parseError);
            throw new Error(`Invalid JSON in model response: ${parseError.message}`);
          }
        } else {
          insightsData = modelContent;
        }
        
        // Validate the response
        if (isValidInsightsResponse(insightsData)) {
          console.log(`Valid insights response received (attempt #${retryCount + 1})`);
          validResponse = true;
          return {
            ...responseData,
            insights: insightsData
          };
        } else {
          console.error(`Invalid insights format (attempt #${retryCount + 1}):`, insightsData);
          throw new Error('Response did not contain valid insights data');
        }
      } catch (parseError) {
        console.error(`Error processing OpenRouter response (attempt #${retryCount + 1}):`, parseError);
        throw parseError;
      }
    } catch (error) {
      console.error(`Error in attempt #${retryCount + 1}:`, error);
      retryCount++;
      
      if (retryCount >= maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Giving up.`);
        throw error;
      }
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
  
  throw new Error('Failed to get valid insights after maximum retries');
}
