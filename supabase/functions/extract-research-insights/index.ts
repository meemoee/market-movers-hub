
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
  currentDate?: string; // Add explicit current date parameter
  stream?: boolean; // Add streaming option
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
      relatedMarkets,
      currentDate, 
      stream = false 
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
      relatedMarketsCount: relatedMarkets?.length || 0,
      currentDate: currentDate || 'Not provided',
      streamingMode: stream ? 'Enabled' : 'Disabled'
    });

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    // Get current date in a readable format, prioritize the passed date if available
    const formattedCurrentDate = currentDate || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    console.log(`Using current date for analysis: ${formattedCurrentDate}`);

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
      ? `\nCRITICAL: This analysis is specifically focused on: "${focusText}"\nYou MUST ensure ALL evidence points directly address this specific focus area.\n`
      : '';

    const dateContext = `\nTODAY'S DATE: ${formattedCurrentDate}\nWhen generating probability estimates, consider the temporal relevance of information relative to today's date. Be explicit about how the recency or timeliness of information impacts your assessment.\n`;

    const systemPrompt = `You are an expert market research analyst and probabilistic forecaster.${marketContext}${focusContext}${dateContext}
Your task is to analyze the provided web research and generate precise probability estimates based on concrete evidence.

CRITICAL GUIDELINES FOR PROBABILITY ASSESSMENT:
1. Historical Precedents: Always cite specific historical events, statistics, or past occurrences that inform your estimate
2. Key Conditions: Identify and analyze the specific conditions that must be met for the event to occur
3. Impact Factors: List the major factors that could positively or negatively impact the probability
4. Evidence Quality: Assess the reliability and relevance of your sources
5. Uncertainty: Acknowledge key areas of uncertainty and how they affect your estimate
6. Competitive Analysis: When relevant, analyze competitor positions and market dynamics
7. Timeline Considerations: Account for time-dependent factors and how they affect probability
8. Temporal Relevance: Consider how the recency of information (relative to today, ${formattedCurrentDate}) affects your probability assessment
${focusText ? `9. FOCUS AREA: Every evidence point MUST explicitly connect to the focus area: "${focusText}". Prioritize evidence that directly addresses this specific aspect.\n` : ''}

Format your analysis as a JSON object with:
{
  "probability": "X%" (numerical percentage with % sign),
  "areasForResearch": ["area 1", "area 2", "area 3", ...] (specific research areas as an array of strings),
  "reasoning": {
    "evidenceFor": [
      "Detailed point 1 supporting the event happening, with specific examples, statistics, or historical precedents${focusText ? ` that directly addresses the focus area: "${focusText}"` : ''}",
      "Detailed point 2 supporting the event happening"
      // Add multiple points as needed
    ],
    "evidenceAgainst": [
      "Detailed point 1 against the event happening, with specific examples, statistics, or historical precedents${focusText ? ` that directly addresses the focus area: "${focusText}"` : ''}",
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
- Evaluate the temporal relevance of all evidence - clearly indicate when information may be outdated relative to today (${formattedCurrentDate}).${focusText ? `\n- EVERY evidence point MUST explicitly address the focus area: "${focusText}". If evidence doesn't directly relate to this focus, it should be excluded or clearly connected to the focus.` : ''}`;

    const prompt = `Here is the web content I've collected during research:
---
${truncatedContent}
---

And here is my analysis of this content:
---
${truncatedAnalysis}
---

${previousAnalysesContext}

TODAY'S DATE: ${formattedCurrentDate}

Based on all this information, please provide:
1. A specific probability estimate for the market question: "${marketQuestion}"
2. The key areas where more research is needed
3. A detailed reasoning section with:
   - Evidence FOR the event happening (with specific historical precedents, examples, statistics)
   - Evidence AGAINST the event happening (with specific historical precedents, examples, statistics)
4. Consider the temporal relevance of all evidence relative to today's date (${formattedCurrentDate})
${focusText ? `\nCRITICAL: Your analysis MUST focus specifically on: "${focusText}"\nEnsure ALL evidence points directly address this specific focus area.\n` : ''}
${relatedMarkets && relatedMarkets.length > 0 ? 
  `5. Analysis of how the following related markets affect your assessment:
${relatedMarkets.map(m => `   - "${m.question}": ${(m.probability * 100).toFixed(1)}%${m.price_change ? ` (${m.price_change > 0 ? '+' : ''}${(m.price_change * 100).toFixed(1)}pp change)` : ''}`).join('\n')}` 
  : ''}

Remember to format your response as a valid JSON object with probability, areasForResearch, and reasoning fields.`;

    // Implementation for streaming responses
    if (stream) {
      console.log("Using streaming mode for response");
      
      // Set up streaming response
      const encoder = new TextEncoder();
      const responseBody = new ReadableStream({
        async start(controller) {
          try {
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
              controller.enqueue(encoder.encode(JSON.stringify({ error: `API error: ${response.status}` })));
              controller.close();
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              controller.enqueue(encoder.encode(JSON.stringify({ error: "Failed to get reader from response" })));
              controller.close();
              return;
            }

            let accumulatedJson = "";
            let buffer = "";
            let streamPart = 0;  // To keep track of streaming progress

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = new TextDecoder().decode(value);
              buffer += chunk;
              
              // Process the buffer line by line
              let newlineIndex;
              while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                
                if (line.startsWith('data: ')) {
                  const data = line.slice(5).trim();
                  
                  // Handle the [DONE] message
                  if (data === '[DONE]') {
                    continue;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                      const content = parsed.choices[0].delta.content || '';
                      if (content) {
                        accumulatedJson += content;
                        streamPart++;
                        
                        // Send the data more frequently in smaller chunks
                        // with additional metadata to help the client
                        const streamData = {
                          choices: [
                            {
                              delta: { content },
                              index: 0,
                              finish_reason: null
                            }
                          ],
                          id: `stream-${streamPart}`,
                          streamPart,
                          partialComplete: false
                        };
                        
                        // Send the chunk to the client
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`));
                      }
                    }
                  } catch (e) {
                    console.error("Error parsing SSE data:", e);
                  }
                }
              }
            }
            
            // Signal the end of the stream
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            
          } catch (error) {
            console.error('Streaming error:', error);
            controller.enqueue(encoder.encode(JSON.stringify({ error: error.message || 'Unknown streaming error' })));
            controller.close();
          }
        }
      });

      return new Response(responseBody, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } 
    else {
      // Non-streaming version for background jobs
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
          // For background jobs, don't stream
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

      // Parse the response as JSON and return it
      const results = await response.json();
      return new Response(JSON.stringify(results), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      });
    }
  } catch (error) {
    console.error('Error in extract-research-insights:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        probability: "Error: Could not analyze",
        areasForResearch: [],
        reasoning: {
          evidenceFor: [],
          evidenceAgainst: []
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
