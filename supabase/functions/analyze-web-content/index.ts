
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

    // Get current date in a readable format
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const marketContext = marketId
      ? `\nImportant context: You are analyzing content for prediction market ID: ${marketId}\n`
      : '';

    const focusContext = focusText
      ? `\nCRITICAL: Focus your analysis EXCLUSIVELY on: "${focusText}"\nYou MUST ensure ALL insights directly address this specific focus area.\n`
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

    const dateContext = `\nTODAY'S DATE: ${currentDate}\nWhen analyzing content, consider the recency and temporal relevance of information relative to today's date. Give higher weight to more recent information and explicitly note when information may be outdated.\n`;

    const systemPrompt = `You are an expert market research analyst focused on evidence-based analysis.${marketContext}${focusContext}${researchAreasContext}${marketPriceContext}${relatedMarketsContext}${dateContext}

Your task is to analyze web content to assess the probability of market outcomes. Follow these critical guidelines:

1. Historical Analysis
   - Identify and analyze relevant historical precedents
   - Compare current situation with similar past events
   - Note key differences that might affect outcomes

2. Evidence Assessment
   - Evaluate source credibility and relevance
   - Highlight strongest evidence points
   - Note potential biases or limitations
   - EXTRACT SPECIFIC NUMBERS AND STATISTICS wherever possible
   - PRIORITIZE RECENT DATA over older information
   - EMPHASIZE OFFICIAL SOURCES mentioned in the market description

3. Impact Factor Analysis
   - List major factors affecting probability
   - Analyze positive and negative influences
   - Consider timing and sequence of events
   - Quantify factors with specific numbers when possible

4. Condition Mapping
   - Identify necessary conditions for the event
   - Assess likelihood of conditions being met
   - Note dependencies between conditions
   - Use specific metrics and timelines when available

5. Uncertainty Analysis
   - Highlight key areas of uncertainty
   - Discuss potential unknown factors
   - Consider alternative scenarios
   
6. Temporal Relevance
   - Evaluate information recency relative to today (${currentDate})
   - CLEARLY FLAG when data is from before 2024
   - Note when data may be outdated
   - Consider what might have changed since information was published
   - Give greater weight to the most recent information

7. Data Precision
   - Extract and highlight specific statistics, percentages, and numbers
   - Note dates associated with any statistical data
   - Compare different data points to identify trends
   - Indicate reliability of quantitative information

8. Resolution Timing
   - Identify when this market question will be resolved
   - Analyze when conclusive data will become available
   - Consider if resolution criteria are clearly defined
   - Note any official announcement dates or deadlines
   - Discuss factors that could accelerate or delay resolution

9. Time Horizon Assessment
   - CRITICALLY ASSESS the time remaining until market resolution deadline
   - Calculate the likelihood of changes occurring within the remaining timeframe
   - Compare historical rates of change with time remaining
   - Identify upcoming events that could impact the outcome before deadline
   - Assess whether the current trajectory will remain stable until resolution

10. Change Momentum Analysis
    - Evaluate the rate and direction of recent changes
    - Identify accelerating or decelerating trends
    - Assess whether the market has likely reached equilibrium
    - Determine if there is sufficient time for significant changes to occur
    - Consider the time typically required for similar changes in comparable cases

${focusText ? `11. Focus Area Priority
   - EVERY insight MUST explicitly address the focus area: "${focusText}"
   - Information not directly related to the focus area should be excluded
   - Clearly explain how each point connects to the specified focus` : ''}

Be factual, precise, and evidence-based in your analysis. Prioritize recent information, exact statistics, and official sources, especially those mentioned in the market description. Pay special attention to time-sensitive factors and the likelihood of changes before the market deadline.`;

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

    prompt += `\nTODAY'S DATE: ${currentDate}

Based solely on the information in this content:
1. What are the key facts and insights relevant to the market question "${question}"? PRIORITIZE recent information (2024-2025), LATEST FIGURES and OFFICIAL SOURCES mentioned in the market description. Extract specific numbers, percentages and statistics.
${focusText ? `1a. CRITICAL: Focus specifically ONLY on aspects directly related to: "${focusText}"` : ''}
2. What evidence supports or contradicts the proposition? Pay special attention to verifiable data points, statistics, and recent developments from OFFICIAL SOURCES.
3. Considering today's date (${currentDate}), how recent and relevant is the information? CLEARLY INDICATE the dates of any statistics or data points.
${isMarketResolved ? 
  `4. Since the market price is ${marketPrice}%, which indicates the event has ${marketPrice === 100 ? 'already occurred' : 'definitely not occurred'}, explain what evidence supports this outcome.` : 
  `4. How does this information affect the probability assessment? Use specific quantitative data points where available.`
}
5. What conclusions can we draw about the ${isMarketResolved ? 'reasons for this outcome' : 'likely outcome'}? Support with the most recent available statistics.
6. IMPORTANT: Provide an estimated probability range (e.g., 30-40%) based on the evidence analyzed.
7. IMPORTANT: List specific areas that need further research or inspection to improve confidence in this assessment.
8. CRITICAL: When will this market question be resolved, and when will conclusive data become available? Identify any official deadlines, announcement dates, or resolution criteria.
9. CRITICAL: Assess the likelihood of significant changes before the market resolution deadline. Consider:
   a. The time remaining until the deadline
   b. Historical rates of change for similar situations
   c. Upcoming events that might impact the outcome
   d. Whether current trajectories are likely to remain stable
10. CRITICAL: Evaluate the momentum of recent changes and whether there is sufficient time for the outcome to change before the deadline.
${marketPrice !== undefined && !isMarketResolved ? `11. Does the current market price of ${marketPrice}% seem reasonable based on the evidence? Why or why not?` : ''}
${relatedMarkets && relatedMarkets.length > 0 ? `12. Are there any insights that might relate to the connected markets mentioned in context? Explain any potential correlations or dependencies.` : ''}
${focusText ? `\nCRITICAL REMINDER: Your analysis MUST focus EXCLUSIVELY on: "${focusText}"\nEnsure ALL insights directly address this specific focus area.\n` : ''}

IMPORTANT REQUIREMENTS:
- Prioritize and highlight the MOST RECENT information available in the content
- Extract and include SPECIFIC STATISTICS, NUMBERS, and PERCENTAGES whenever possible
- CLEARLY INDICATE the publication dates or timeframes of any data points you reference
- Apply greater weight to information from 2024-2025 compared to older sources
- Flag any data points older than 2023 as potentially outdated
- Specifically address WHEN this market will be resolved and when conclusive data will be available
- Explicitly assess whether there is enough time for significant changes before the deadline
- Emphasize information from OFFICIAL SOURCES, especially those mentioned in the market description

Ensure your analysis is factual, balanced, and directly addresses the market question.`;

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
