
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
        model: openAIKey ? 'gpt-4o-mini' : 'openai/gpt-4o-mini',
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

    // Process the stream to ensure we get valid JSON
    const transformStream = new TransformStream({
      start(controller) {
        this.buffer = '';
        this.jsonAccumulator = '';
        this.jsonStarted = false;
        this.jsonCompleted = false;
      },
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        this.buffer += text;
        
        // Process events in buffer
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              // Finish JSON if we've started but not completed
              if (this.jsonStarted && !this.jsonCompleted) {
                try {
                  const validJson = JSON.parse(this.jsonAccumulator);
                  controller.enqueue(new TextEncoder().encode(
                    `data: ${JSON.stringify({
                      choices: [{
                        delta: { content: "" },
                        message: { content: JSON.stringify(validJson) }
                      }]
                    })}\n\n`
                  ));
                  this.jsonCompleted = true;
                } catch (e) {
                  // If we can't parse, send a default
                  controller.enqueue(new TextEncoder().encode(
                    `data: ${JSON.stringify({
                      choices: [{
                        delta: { content: "" },
                        message: { content: JSON.stringify({
                          probability: "50%",
                          areasForResearch: ["Additional data", "Expert opinions"]
                        })}
                      }]
                    })}\n\n`
                  ));
                }
              }
              controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
              continue;
            }
            
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              
              if (content) {
                if (!this.jsonStarted && content.includes('{')) {
                  this.jsonStarted = true;
                  this.jsonAccumulator = content.substring(content.indexOf('{'));
                } else if (this.jsonStarted && !this.jsonCompleted) {
                  this.jsonAccumulator += content;
                  if (content.includes('}') && this.isValidJson(this.jsonAccumulator)) {
                    this.jsonCompleted = true;
                  }
                }
              }
              
              // Re-emit the event
              controller.enqueue(new TextEncoder().encode(`data: ${dataStr}\n\n`));
            } catch (e) {
              console.error('Error processing stream chunk:', e);
            }
          }
        }
      },
      flush(controller) {
        // Final cleanup and ensuring valid JSON was emitted
        if (this.jsonStarted && !this.jsonCompleted) {
          try {
            // Try to complete the JSON or send default
            const forceCompleted = this.jsonAccumulator + 
              (this.jsonAccumulator.includes('}') ? '' : '}');
            
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({
                choices: [{
                  delta: { content: "" },
                  message: { content: JSON.stringify({
                    probability: "50%",
                    areasForResearch: ["Additional market data", "Expert opinions"]
                  })}
                }]
              })}\n\n`
            ));
          } catch (e) {
            console.error('Error in flush:', e);
          }
        }
      },
      isValidJson(str) {
        try {
          JSON.parse(str);
          return true;
        } catch (e) {
          return false;
        }
      }
    });

    // Return the transformed streaming response
    return new Response(response.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
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
