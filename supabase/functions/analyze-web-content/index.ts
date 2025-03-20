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

// Constants for stream handling
const HEARTBEAT_INTERVAL = 5000 // 5 seconds
const RECONNECT_DELAY = 2000 // 2 seconds
const STREAM_TIMEOUT = 60000 // 60 seconds timeout threshold
const MAX_RETRIES = 3

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

    // Create a TransformStream to handle the streaming response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Start the heartbeat mechanism in the background
    let heartbeatInterval: number | undefined
    
    const startHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      
      heartbeatInterval = setInterval(async () => {
        try {
          // Send a comment as heartbeat to keep the connection alive
          await writer.write(new TextEncoder().encode(":\n\n"))
          console.log('Heartbeat sent')
        } catch (error) {
          console.error('Error sending heartbeat:', error)
          clearInterval(heartbeatInterval)
        }
      }, HEARTBEAT_INTERVAL)
    }

    // Function to cleanup resources
    const cleanup = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = undefined
      }
    }

    // Queue for processing large chunks in the background
    const streamQueue: {value: Uint8Array, timestamp: number}[] = []
    let processingQueue = false
    
    // Process the queue in the background
    const processQueue = async () => {
      if (processingQueue || streamQueue.length === 0) return
      
      processingQueue = true
      
      try {
        while (streamQueue.length > 0) {
          const chunk = streamQueue.shift()
          if (chunk) {
            try {
              await writer.write(chunk.value)
            } catch (error) {
              console.error('Error writing chunk from queue:', error)
              // If we can't write, stop processing
              break
            }
          }
        }
      } finally {
        processingQueue = false
        
        // If there are more chunks, process them
        if (streamQueue.length > 0) {
          processQueue()
        }
      }
    }

    // Launch a background task to fetch and stream the response
    (async () => {
      let retryCount = 0
      let succeeded = false
      
      while (retryCount < MAX_RETRIES && !succeeded) {
        try {
          console.log(`Making request to OpenRouter API (attempt ${retryCount + 1})...`)
          
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

          // Start the heartbeat after successful connection
          startHeartbeat()

          // Process the stream
          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('Failed to get reader from response')
          }

          // Setup connection timeout detection
          let lastDataTimestamp = Date.now()
          const connectionTimeoutId = setInterval(() => {
            const now = Date.now()
            if (now - lastDataTimestamp > STREAM_TIMEOUT) { 
              console.warn('Connection appears stalled, no data received for 60 seconds')
              clearInterval(connectionTimeoutId)
              throw new Error('Stream connection timeout after 60 seconds of inactivity')
            }
          }, 5000)

          const textDecoder = new TextDecoder()
          let chunkCounter = 0
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              
              if (done) {
                console.log('Stream complete')
                succeeded = true
                clearInterval(connectionTimeoutId)
                break
              }
              
              // Update the last data timestamp
              lastDataTimestamp = Date.now()
              chunkCounter++
              
              try {
                // Add to queue with timestamp
                streamQueue.push({
                  value,
                  timestamp: Date.now()
                })
                
                // Start or continue processing the queue
                if (!processingQueue) {
                  processQueue()
                }
                
                // For debugging - log every 50 chunks
                if (chunkCounter % 50 === 0) {
                  console.log(`Processed ${chunkCounter} chunks, queue size: ${streamQueue.length}`)
                }
              } catch (queueError) {
                console.error(`Error processing chunk ${chunkCounter}:`, queueError)
              }
            }
          } catch (streamError) {
            console.error('Error reading stream:', streamError)
            clearInterval(connectionTimeoutId)
            
            // Attempt to recover by sending what we have
            if (streamQueue.length > 0) {
              console.log(`Attempting to flush ${streamQueue.length} remaining chunks after stream error`)
              while (streamQueue.length > 0) {
                const chunk = streamQueue.shift()
                if (chunk) {
                  try {
                    await writer.write(chunk.value)
                  } catch (error) {
                    console.error('Error flushing queue after stream error:', error)
                    break
                  }
                }
              }
            }
            
            throw streamError
          } finally {
            reader.releaseLock()
          }
          
          break // Exit the retry loop if successful
        } catch (error) {
          retryCount++
          console.error(`Attempt ${retryCount} failed:`, error)
          
          if (retryCount < MAX_RETRIES) {
            console.log(`Retrying in ${RECONNECT_DELAY}ms...`)
            await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY))
          }
        }
      }
      
      if (!succeeded) {
        console.error(`Failed after ${MAX_RETRIES} attempts`)
        await writer.write(
          new TextEncoder().encode(
            `data: {"choices":[{"delta":{"content":" Sorry, I encountered an error processing your request after multiple attempts."}}]}\n\n`
          )
        )
      }
      
      try {
        // Flush any remaining chunks in the queue
        if (streamQueue.length > 0) {
          console.log(`Flushing ${streamQueue.length} remaining chunks before closing`)
          while (streamQueue.length > 0) {
            const chunk = streamQueue.shift()
            if (chunk) {
              try {
                await writer.write(chunk.value)
              } catch (error) {
                console.error('Error in final queue flush:', error)
                break
              }
            }
          }
        }
        
        // Close the writer to signal the end
        await writer.write(new TextEncoder().encode("data: [DONE]\n\n"))
        await writer.close()
      } catch (closeError) {
        console.error('Error closing writer:', closeError)
      } finally {
        cleanup()
      }
    })();

    return new Response(readable, {
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
