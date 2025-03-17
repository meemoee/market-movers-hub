
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to create properly formatted SSE messages
function formatSSE(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketQuestion, qaContext, researchContext, isContinuation, originalQuestion, historyContext } = await req.json()

    const questionToUse = isContinuation && originalQuestion ? originalQuestion : marketQuestion;
    
    console.log(`Evaluating QA for market question: ${questionToUse?.substring(0, 50)}...`);
    console.log(`QA context length: ${qaContext?.length || 0}, has research context: ${!!researchContext}, is continuation: ${!!isContinuation}, has history context: ${!!historyContext}`);

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterKey) {
      throw new Error('Missing OpenRouter API key')
    }

    const systemPrompt = `You are a precise analyst evaluating market predictions. Review the question-answer analysis and determine:
1. The most likely probability of the event occurring (as a percentage)
2. Key areas that need more research
3. A concise final analysis

${isContinuation ? 'This is a continuation or in-depth exploration of a previous analysis.' : ''}
${historyContext ? 'Consider this previous analysis context when forming your response:' + historyContext : ''}
Be specific and data-driven in your evaluation.`

    const userPrompt = `Market Question: ${questionToUse}

Q&A Analysis:
${qaContext}

${researchContext ? `Additional Research Context:
${researchContext.analysis}` : ''}

Based on this analysis, provide:
1. A probability estimate (just the number, e.g. "75%")
2. 2-3 key areas that need more research
3. A concise final analysis explaining the reasoning

Format your response as JSON with these fields:
{
  "probability": "X%",
  "areasForResearch": ["area1", "area2", ...],
  "analysis": "your analysis here"
}`

    console.log("Calling OpenRouter with market question:", questionToUse?.substring(0, 100) + "...");
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      console.error(`OpenRouter API error: ${response.status}`);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    // A simple TransformStream that buffers incoming text until full SSE events are available.
    let buffer = "";
    let collectingData = false;
    let jsonData = "";
    
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        const parts = buffer.split("\n\n");
        // Keep the last (possibly incomplete) part in the buffer.
        buffer = parts.pop() || "";
        
        for (const part of parts) {
          if (part.startsWith("data: ")) {
            const dataStr = part.slice(6).trim();
            if (dataStr === "[DONE]") {
              // End of stream
              if (collectingData) {
                try {
                  const parsed = JSON.parse(jsonData);
                  controller.enqueue(new TextEncoder().encode(formatSSE(parsed)));
                } catch (err) {
                  console.error("Error parsing final collected JSON:", err);
                  controller.enqueue(new TextEncoder().encode(formatSSE({"error": "Failed to parse JSON"})));
                }
              }
              continue;
            }
            
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices?.[0]?.delta?.content || 
                             parsed.choices?.[0]?.message?.content || '';
              
              if (content) {
                // Check if the content looks like the start of JSON
                if (content.trim().startsWith('{') && !collectingData) {
                  collectingData = true;
                  jsonData = content;
                } else if (collectingData) {
                  jsonData += content;
                } else {
                  // If we're not collecting JSON yet, emit the content directly
                  controller.enqueue(new TextEncoder().encode(formatSSE({content})));
                }
                
                // Check if we have complete JSON
                if (collectingData && jsonData.trim().endsWith('}')) {
                  try {
                    const parsedJson = JSON.parse(jsonData);
                    console.log("Collected complete JSON:", JSON.stringify(parsedJson).substring(0, 100) + "...");
                    controller.enqueue(new TextEncoder().encode(formatSSE(parsedJson)));
                    collectingData = false;
                    jsonData = "";
                  } catch (err) {
                    // Not complete JSON yet, continue collecting
                    console.debug("Still collecting JSON, not complete yet");
                  }
                }
              }
            } catch (err) {
              console.debug("Error parsing SSE chunk:", err);
            }
          }
        }
      },
      flush(controller) {
        if (buffer.trim() || jsonData.trim()) {
          try {
            let finalData = buffer.trim() || jsonData.trim();
            if (finalData.startsWith('data: ')) {
              finalData = finalData.slice(6).trim();
            }
            
            if (finalData === "[DONE]") {
              return;
            }
            
            let parsedData;
            try {
              parsedData = JSON.parse(finalData);
            } catch (err) {
              // If it's not valid JSON but we've been collecting JSON data
              if (collectingData && jsonData) {
                try {
                  parsedData = JSON.parse(jsonData);
                } catch (innerErr) {
                  console.error("Error parsing final JSON data:", innerErr);
                  // Create a default response if parsing fails
                  parsedData = {
                    probability: "50%",
                    areasForResearch: ["Additional market data", "Expert opinions"],
                    analysis: "Insufficient information to provide a detailed analysis."
                  };
                }
              } else {
                // Create a default response
                parsedData = {
                  probability: "50%",
                  areasForResearch: ["Additional market data", "Expert opinions"],
                  analysis: "Insufficient information to provide a detailed analysis."
                };
              }
            }
            
            controller.enqueue(new TextEncoder().encode(formatSSE(parsedData)));
          } catch (err) {
            console.error("Error in flush:", err);
            const defaultData = {
              probability: "50%",
              areasForResearch: ["Additional market data", "Expert opinions"],
              analysis: "An error occurred during analysis. Please try again."
            };
            controller.enqueue(new TextEncoder().encode(formatSSE(defaultData)));
          }
        }
        
        buffer = "";
        jsonData = "";
      }
    });

    return new Response(response.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Error in evaluate-qa-final:', error);
    const errorResponse = {
      error: error.message,
      probability: "50%",
      areasForResearch: ["Error analysis", "Technical issues"],
      analysis: "An error occurred during analysis. Please try again."
    };
    
    return new Response(
      formatSSE(errorResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } }
    );
  }
})
