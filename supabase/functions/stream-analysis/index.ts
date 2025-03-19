
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

interface StreamAnalysisRequest {
  jobId: string;
  content: string;
  query: string;
  question: string;
  focusText?: string;
  previousAnalyses?: string;
  areasForResearch?: string[];
  marketPrice?: number;
  relatedMarkets?: any[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

    const { 
      jobId,
      content, 
      query, 
      question, 
      focusText,
      previousAnalyses,
      areasForResearch,
      marketPrice,
      relatedMarkets
    } = await req.json() as StreamAnalysisRequest;

    console.log(`Stream analysis request for job ID ${jobId}:`, {
      contentLength: content?.length || 0,
      query: query?.substring(0, 100) || 'Not provided',
      question: question?.substring(0, 100) || 'Not provided',
      focusText: focusText ? `${focusText.substring(0, 100)}...` : 'None specified',
    });

    if (!jobId) {
      throw new Error('Job ID is required');
    }

    // Create Supabase client to update job progress
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Prepare OpenRouter request
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

    const marketContext = jobId
      ? `\nImportant context: You are analyzing content for prediction market job ID: ${jobId}\n`
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

${focusText ? `9. Focus Area Priority
   - EVERY insight MUST explicitly address the focus area: "${focusText}"
   - Information not directly related to the focus area should be excluded
   - Clearly explain how each point connects to the specified focus` : ''}

Be factual, precise, and evidence-based in your analysis. Prioritize recent information and exact statistics.`;

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
1. What are the key facts and insights relevant to the market question "${question}"? PRIORITIZE recent information (2024-2025) and extract specific numbers, percentages and statistics.
${focusText ? `1a. CRITICAL: Focus specifically ONLY on aspects directly related to: "${focusText}"` : ''}
2. What evidence supports or contradicts the proposition? Pay special attention to verifiable data points, statistics, and recent developments.
3. Considering today's date (${currentDate}), how recent and relevant is the information? CLEARLY INDICATE the dates of any statistics or data points.
${isMarketResolved ? 
  `4. Since the market price is ${marketPrice}%, which indicates the event has ${marketPrice === 100 ? 'already occurred' : 'definitely not occurred'}, explain what evidence supports this outcome.` : 
  `4. How does this information affect the probability assessment? Use specific quantitative data points where available.`
}
5. What conclusions can we draw about the ${isMarketResolved ? 'reasons for this outcome' : 'likely outcome'}? Support with the most recent available statistics.
6. IMPORTANT: Provide an estimated probability range (e.g., 30-40%) based on the evidence analyzed.
7. IMPORTANT: List specific areas that need further research or inspection to improve confidence in this assessment.
8. CRITICAL: When will this market question be resolved, and when will conclusive data become available? Identify any official deadlines, announcement dates, or resolution criteria.
${marketPrice !== undefined && !isMarketResolved ? `9. Does the current market price of ${marketPrice}% seem reasonable based on the evidence? Why or why not?` : ''}
${relatedMarkets && relatedMarkets.length > 0 ? `10. Are there any insights that might relate to the connected markets mentioned in context? Explain any potential correlations or dependencies.` : ''}
${focusText ? `\nCRITICAL REMINDER: Your analysis MUST focus EXCLUSIVELY on: "${focusText}"\nEnsure ALL insights directly address this specific focus area.\n` : ''}

IMPORTANT REQUIREMENTS:
- Prioritize and highlight the MOST RECENT information available in the content
- Extract and include SPECIFIC STATISTICS, NUMBERS, and PERCENTAGES whenever possible
- CLEARLY INDICATE the publication dates or timeframes of any data points you reference
- Apply greater weight to information from 2024-2025 compared to older sources
- Flag any data points older than 2023 as potentially outdated
- Specifically address WHEN this market will be resolved and when conclusive data will be available

Ensure your analysis is factual, balanced, and directly addresses the market question.`;

    // Initialize streaming response to the client
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let accumulatedText = "";
          
          // Track the last time we updated the database
          let lastDbUpdateTime = Date.now();
          const DB_UPDATE_INTERVAL = 5000; // Update DB every 5 seconds

          // Connect to OpenRouter with streaming enabled
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
            throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("Response body reader is null");
          }

          // Helper function to encode and send SSE messages
          const sendSSE = (data: string) => {
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
          };

          // Start reading the stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Parse the chunk
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = line.slice(6);
                  if (data === '[DONE]') continue;
                  
                  const json = JSON.parse(data);
                  const content = json.choices?.[0]?.delta?.content || '';
                  
                  if (content) {
                    // Add to accumulated text
                    accumulatedText += content;
                    
                    // Forward the content to the client
                    sendSSE(JSON.stringify({ chunk: content, jobId }));
                    
                    // Periodically update the database with accumulated content
                    const now = Date.now();
                    if (now - lastDbUpdateTime > DB_UPDATE_INTERVAL) {
                      try {
                        // Update the job results in the database
                        await supabaseAdmin.rpc('update_research_results', {
                          job_id: jobId,
                          result_data: JSON.stringify({ analysis: accumulatedText }),
                        });
                        lastDbUpdateTime = now;
                      } catch (dbError) {
                        console.error('Error updating research results:', dbError);
                      }
                    }
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
          
          // Final update to the database with complete analysis
          if (accumulatedText) {
            try {
              await supabaseAdmin.rpc('update_research_results', {
                job_id: jobId,
                result_data: JSON.stringify({ analysis: accumulatedText }),
              });
              
              // Append completion message to progress log
              await supabaseAdmin.rpc('append_research_progress', {
                job_id: jobId,
                progress_entry: "Analysis streaming completed"
              });
            } catch (dbError) {
              console.error('Error updating final research results:', dbError);
            }
          }
          
          // Send done message
          sendSSE(JSON.stringify({ done: true, jobId }));
          controller.close();
        } catch (error) {
          console.error('Error in stream-analysis edge function:', error);
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: error.message, jobId })}\n\n`)
          );
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Error in stream-analysis:', error);
    
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
